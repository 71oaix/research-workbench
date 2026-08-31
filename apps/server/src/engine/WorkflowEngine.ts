import type {
  Artifact,
  Decision,
  ServerEvent,
  Step,
  StepSpec,
  UsageSummary,
  Workflow,
} from '@research-workbench/shared'
import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from './eventBus'
import type { StepRunner } from './StepRunner'

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export interface WorkflowDetail {
  workflow: Workflow
  steps: Step[]
  artifacts: Artifact[]
  decisions: Decision[]
  usageSummary: UsageSummary[]
}

export class WorkflowEngine {
  /** 运行中工作流的取消标志（cancel() 置位；runPendingSteps 每步检查） */
  private readonly cancelled = new Set<string>()

  constructor(
    private readonly repos: Repositories,
    private readonly runner: StepRunner,
    private readonly bus: WorkflowEventBus
  ) {}

  /** 取消轮询：session.abort 只能中断活跃流，send 间隙由 runner 的检查点拦截 */
  isCancelled(workflowId: string): boolean {
    return this.cancelled.has(workflowId)
  }

  /**
   * 取消运行中的工作流：置取消标志 → 正在执行的模型调用由外部 abort（半成品丢弃）。
   * 剩余 pending 步骤标 skipped；仅 executing 状态可取消（paused 用审批"取消任务"）。
   */
  async cancel(workflowId: string): Promise<Workflow> {
    const workflow = this.requireWorkflow(workflowId)
    if (workflow.status !== 'executing') {
      throw new EngineError('workflow_not_executing', 409)
    }
    this.cancelled.add(workflowId)
    this.setWorkflowStatus(workflowId, 'cancelled')
    return this.requireWorkflow(workflowId)
  }

  createWorkflow(input: { goal: string; steps: StepSpec[] }): Workflow {
    const workflow = this.repos.workflows.create(input.goal)
    input.steps.forEach((spec, index) => {
      this.repos.steps.create({
        workflowId: workflow.id,
        label: spec.label,
        role: spec.role,
        position: index,
        requiresApproval: spec.requiresApproval,
      })
    })
    this.bus.emit({ type: 'workflow.created', workflow })
    return workflow
  }

  getDetail(workflowId: string): WorkflowDetail {
    this.requireWorkflow(workflowId)
    return {
      workflow: this.requireWorkflow(workflowId),
      steps: this.stepsSorted(workflowId),
      artifacts: this.repos.artifacts.listByWorkflow(workflowId),
      decisions: this.repos.decisions.listByWorkflow(workflowId),
      usageSummary: this.repos.usage.summaryByWorkflow(workflowId),
    }
  }

  async start(workflowId: string): Promise<Workflow> {
    const workflow = this.requireWorkflow(workflowId)
    if (workflow.status !== 'planning') {
      throw new EngineError('workflow_not_planning', 409)
    }
    this.setWorkflowStatus(workflowId, 'executing')
    await this.runPendingSteps(workflowId)
    return this.requireWorkflow(workflowId)
  }

  recoverInterrupted(): void {
    for (const workflow of this.repos.workflows.list()) {
      const running = this.stepsSorted(workflow.id).find(
        (step) => step.status === 'running'
      )
      if (!running) continue
      const step = this.repos.steps.updateStatus(running.id, 'failed')
      if (step) this.emit({ type: 'step.updated', step })
      const updated = this.repos.workflows.updateStatus(workflow.id, 'failed')
      if (updated) this.emit({ type: 'workflow.updated', workflow: updated })
    }
  }

  async decide(
    workflowId: string,
    stepId: string,
    type: 'approve' | 'modify' | 'reject',
    note: string | null = null
  ): Promise<Workflow> {
    this.requireWorkflow(workflowId)
    this.requireStep(workflowId, stepId)
    // 原子抢占：只有处于 awaiting_approval 的步骤能通过，双击/并发第二次必然 409
    const step = this.repos.steps.updateStatusWhere(stepId, 'awaiting_approval', 'approved')
    if (!step) {
      throw new EngineError('step_not_awaiting_approval', 409)
    }

    const decision = this.repos.decisions.create({
      workflowId,
      stepId,
      type,
      note,
    })
    this.bus.emit({ type: 'decision.created', decision })

    if (type === 'reject') {
      this.setStepStatus(stepId, 'rejected')
      this.setWorkflowStatus(workflowId, 'cancelled')
      return this.requireWorkflow(workflowId)
    }

    if (type === 'modify') {
      const target = this.modifyTarget(step, this.stepsSorted(workflowId))
      for (const candidate of this.stepsSorted(workflowId)) {
        if (candidate.position >= target.position) {
          this.repos.steps.updateStatus(candidate.id, 'pending')
          this.repos.steps.setPendingFeedback(candidate.id, null)
        }
      }
      this.repos.steps.setPendingFeedback(target.id, note)
      this.cancelled.delete(workflowId)
      this.setWorkflowStatus(workflowId, 'executing')
      await this.runPendingSteps(workflowId)
      return this.requireWorkflow(workflowId)
    }

    this.cancelled.delete(workflowId)
    this.setWorkflowStatus(workflowId, 'executing')
    await this.runPendingSteps(workflowId)
    return this.requireWorkflow(workflowId)
  }

  private async runPendingSteps(workflowId: string): Promise<void> {
    const workflow = this.requireWorkflow(workflowId)
    for (const step of this.stepsSorted(workflowId)) {
      if (step.status !== 'pending') continue
      if (this.cancelled.has(workflowId)) {
        this.repos.steps.updateStatus(step.id, 'skipped')
        continue
      }

      this.setStepStatus(step.id, 'running')
      const inputArtifacts = this.repos.artifacts.listByWorkflow(workflowId)
      let result: Awaited<ReturnType<StepRunner['run']>>
      try {
        result = await this.runner.run({
          step,
          goal: workflow.goal,
          inputArtifacts,
          feedback: step.pendingFeedback ?? null,
        })
      } catch (e) {
        if (this.cancelled.has(workflowId)) {
          this.skipRemaining(workflowId, step.position)
          return
        }
        this.setStepStatus(step.id, 'failed')
        this.setWorkflowStatus(workflowId, 'failed')
        throw e
      }
      if (this.cancelled.has(workflowId)) {
        // abort 后 prompt 以 aborted resolve，可能带回半成品文本——丢弃不落库
        this.skipRemaining(workflowId, step.position)
        return
      }
      this.repos.steps.setPendingFeedback(step.id, null)
      const artifact = this.repos.artifacts.create({
        workflowId,
        stepId: step.id,
        name: result.artifactName,
        content: result.content,
      })
      this.bus.emit({ type: 'artifact.updated', artifact })

      if (step.requiresApproval) {
        this.setStepStatus(step.id, 'awaiting_approval')
        this.setWorkflowStatus(workflowId, 'paused')
        return
      }
      this.setStepStatus(step.id, 'approved')
    }
    if (this.cancelled.has(workflowId)) return
    this.setWorkflowStatus(workflowId, 'completed')
  }

  /** 取消后把指定位置起未完成的步骤标 skipped（含正在执行的当前步） */
  private skipRemaining(workflowId: string, fromPosition: number): void {
    for (const step of this.stepsSorted(workflowId)) {
      if (step.position >= fromPosition && (step.status === 'pending' || step.status === 'running')) {
        this.repos.steps.updateStatus(step.id, 'skipped')
      }
    }
  }

  private requireWorkflow(workflowId: string): Workflow {
    const workflow = this.repos.workflows.findById(workflowId)
    if (!workflow) throw new EngineError('workflow_not_found', 404)
    return workflow
  }

  private requireStep(workflowId: string, stepId: string): Step {
    const step = this.stepsSorted(workflowId).find((s) => s.id === stepId)
    if (!step) throw new EngineError('step_not_found', 404)
    return step
  }

  private stepsSorted(workflowId: string): Step[] {
    return this.repos.steps
      .listByWorkflow(workflowId)
      .sort((a, b) => a.position - b.position)
  }

  private modifyTarget(step: Step, steps: Step[]): Step {
    if (step.role === 'reviewer') {
      const writer = [...steps].reverse().find((candidate) => candidate.role === 'writer')
      // 调研模板（无 writer）下 reviewer 打回目标回退为自身重跑
      return writer ?? step
    }
    return step
  }

  private setWorkflowStatus(id: string, status: Workflow['status']): void {
    const workflow = this.repos.workflows.updateStatus(id, status)
    if (workflow) this.emit({ type: 'workflow.updated', workflow })
  }

  private setStepStatus(id: string, status: Step['status']): void {
    const step = this.repos.steps.updateStatus(id, status)
    if (step) this.emit({ type: 'step.updated', step })
  }

  private emit(event: ServerEvent): void {
    this.bus.emit(event)
  }
}
