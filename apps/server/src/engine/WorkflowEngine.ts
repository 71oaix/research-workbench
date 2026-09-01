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

/** 单产物字符上限（正常产物千级；防模型输出失控/复读提示词的兜底拦截） */
const MAX_ARTIFACT_CHARS = 300_000

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
    // 迭代式扫描而非一次性快照：评估低分回环会把 writer 及后续步骤重置为 pending，需重新扫描
    for (;;) {
      const step = this.stepsSorted(workflowId).find((s) => s.status === 'pending')
      if (!step) break
      if (this.cancelled.has(workflowId)) {
        this.skipRemaining(workflowId, step.position)
        return
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
      // 输出失控防护：正常产物为千级字符，超长（如复读提示词）视为模型异常，拦截不落库
      if (result.content.length > MAX_ARTIFACT_CHARS) {
        this.setStepStatus(step.id, 'failed')
        this.setWorkflowStatus(workflowId, 'failed')
        throw new EngineError(
          `步骤「${step.label}」产物异常过大（${result.content.length} 字符），疑似模型输出失控，已拦截不落库`,
          502
        )
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
      // 评估迭代回环：低分自动重写一轮（上限 1 次，见 maybeRewriteOnLowScore）
      if (step.role === 'evaluator' && this.maybeRewriteOnLowScore(workflowId)) {
        continue
      }
    }
    if (this.cancelled.has(workflowId)) return
    this.setWorkflowStatus(workflowId, 'completed')
  }

  /** 评估迭代回环状态：每个工作流最多自动重写 1 轮 */
  private readonly evalRewriteUsed = new Set<string>()

  /**
   * 评估低分时带批评要点自动打回 writer 重写一轮（复用人工打回的 feedback 通道）。
   * 二评达标记"已收敛"；仍低则记"未收敛"并正常完成——如实标注，不静默。
   */
  private maybeRewriteOnLowScore(workflowId: string): boolean {
    const scores = this.repos.artifacts
      .listByWorkflow(workflowId)
      .filter((a) => a.name === 'evaluation-scores.md')
      .at(-1)
    const parsed = scores ? parseEvaluationScores(scores.content) : null
    if (this.evalRewriteUsed.has(workflowId)) {
      if (parsed) {
        this.persistLoopNote(
          workflowId,
          parsed.overall >= 3.5 && parsed.completeness >= 3
            ? `评估回环（上限 1 轮）已执行：二评综合 ${parsed.overall}/5、完整性 ${parsed.completeness}/5 —— 已收敛 ✓`
            : `评估回环（上限 1 轮）已执行：二评综合 ${parsed.overall}/5、完整性 ${parsed.completeness}/5 —— 仍未收敛，如实标注（证据池已为当前检索下的最优可得结果）`
        )
      }
      return false
    }
    if (!parsed) return false
    if (parsed.overall >= 3.5 && parsed.completeness >= 3) return false
    const feedback = buildRewriteFeedback(scores!.content, parsed)
    const steps = this.stepsSorted(workflowId)
    const writer = steps.find((s) => s.role === 'writer')
    if (!writer) return false
    // 与人工打回 modify 相同的状态迁移：writer 及其后全部重置为 pending，writer 注入反馈
    for (const candidate of steps) {
      if (candidate.position >= writer.position) {
        this.setStepStatus(candidate.id, 'pending')
        this.repos.steps.setPendingFeedback(candidate.id, null)
      }
    }
    const withFeedback = this.repos.steps.setPendingFeedback(writer.id, feedback)
    if (withFeedback) this.emit({ type: 'step.updated', step: withFeedback })
    this.evalRewriteUsed.add(workflowId)
    this.persistLoopNote(
      workflowId,
      `评估回环触发（第 1 轮/上限 1 轮）：规则口径综合 ${parsed.overall}/5、完整性 ${parsed.completeness}/5 低于阈值（3.5/3）——已自动打回写作，反馈要点见步骤卡；二评结果将在本文件更新。`
    )
    return true
  }

  private persistLoopNote(workflowId: string, content: string): void {
    const artifact = this.repos.artifacts.create({
      workflowId,
      stepId: null,
      name: 'evaluation-loop.md',
      content,
    })
    this.bus.emit({ type: 'artifact.updated', artifact })
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

/** 解析 evaluation-scores.md 规则口径表（| 维度 | 评分 | 说明 | 行）；无综合或完整性行时返回 null */
function parseEvaluationScores(md: string): { overall: number; completeness: number } | null {
  let overall: number | null = null
  let completeness: number | null = null
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 4) continue
    const num = Number.parseFloat(cells[2])
    if (Number.isNaN(num)) continue
    if (cells[1] === '综合') overall = num
    if (cells[1] === '完整性') completeness = num
  }
  if (overall === null || completeness === null) return null
  return { overall, completeness }
}

/** 从评分表提取低分维度作为重写反馈（要点化 ≤400 字，避免稀释 writer 注意力） */
function buildRewriteFeedback(
  md: string,
  parsed: { overall: number; completeness: number }
): string {
  const weakRows = md
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').map((c) => c.trim()))
    .filter((cells) => {
      const num = Number.parseFloat(cells[2] ?? '')
      return cells.length >= 4 && !Number.isNaN(num) && num < 3.5 && cells[1] !== '综合'
    })
    .map((cells) => `${cells[1]} ${cells[2]}：${cells[3]}`)
  const lines = [
    `上一稿评估未达标（规则口径综合 ${parsed.overall}/5、完整性 ${parsed.completeness}/5）。请针对性重写综述：`,
    ...weakRows.slice(0, 4),
    '要求：优先补足缺失章节的证据支撑；证据池中无对应证据的部分如实说明局限，不得空泛声称。',
  ]
  return lines.join('\n').slice(0, 400)
}
