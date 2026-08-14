import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import { FakeStepRunner } from '../src/engine/StepRunner'
import { EngineError, WorkflowEngine } from '../src/engine/WorkflowEngine'

function setup() {
  const repos = createRepositories(createDb())
  const bus = createEventBus()
  const events: ServerEvent[] = []
  bus.on((e) => events.push(e))
  const engine = new WorkflowEngine(repos, new FakeStepRunner(1), bus)
  return { repos, engine, events }
}

describe('WorkflowEngine', () => {
  it('creates a workflow in planning with ordered steps', () => {
    const { engine, repos } = setup()
    const workflow = engine.createWorkflow({
      goal: '调研 LLM 测试',
      steps: [
        { label: '生成计划', role: 'planner', requiresApproval: true },
        { label: '检索文献', role: 'researcher', requiresApproval: false },
      ],
    })
    expect(workflow.status).toBe('planning')
    const steps = repos.steps.listByWorkflow(workflow.id)
    expect(steps.map((s) => s.position)).toEqual([0, 1])
    expect(steps[0].requiresApproval).toBe(true)
  })

  it('pauses at approval step and completes after approvals', async () => {
    const { engine } = setup()
    const workflow = engine.createWorkflow({
      goal: '调研 LLM 测试',
      steps: [
        { label: '生成计划', role: 'planner', requiresApproval: true },
        { label: '检索文献', role: 'researcher', requiresApproval: false },
        { label: '综述审查', role: 'reviewer', requiresApproval: true },
      ],
    })

    await engine.start(workflow.id)
    let detail = engine.getDetail(workflow.id)
    expect(detail.workflow.status).toBe('paused')
    expect(detail.steps[0].status).toBe('awaiting_approval')
    expect(detail.steps[1].status).toBe('pending')
    expect(detail.artifacts.length).toBe(1)

    await engine.decide(workflow.id, detail.steps[0].id, 'approve')
    detail = engine.getDetail(workflow.id)
    expect(detail.steps[0].status).toBe('approved')
    expect(detail.steps[1].status).toBe('approved')
    expect(detail.steps[2].status).toBe('awaiting_approval')
    expect(detail.workflow.status).toBe('paused')
    expect(detail.artifacts.length).toBe(3)
    expect(detail.artifacts[1].content).toContain('生成计划')

    await engine.decide(workflow.id, detail.steps[2].id, 'approve')
    detail = engine.getDetail(workflow.id)
    expect(detail.workflow.status).toBe('completed')
    expect(detail.steps.every((s) => s.status === 'approved')).toBe(true)
  })

  it('rejects and cancels the workflow with a decision record', async () => {
    const { engine } = setup()
    const workflow = engine.createWorkflow({
      goal: '调研',
      steps: [{ label: '生成计划', role: 'planner', requiresApproval: true }],
    })
    await engine.start(workflow.id)
    const detail = engine.getDetail(workflow.id)
    await engine.decide(workflow.id, detail.steps[0].id, 'reject', '方向不对')
    const after = engine.getDetail(workflow.id)
    expect(after.workflow.status).toBe('cancelled')
    expect(after.steps[0].status).toBe('rejected')
    expect(after.decisions[0]).toMatchObject({ type: 'reject', note: '方向不对' })
  })

  it('emits all lifecycle events', async () => {
    const { engine, events } = setup()
    const workflow = engine.createWorkflow({
      goal: '调研',
      steps: [{ label: '生成计划', role: 'planner', requiresApproval: true }],
    })
    await engine.start(workflow.id)
    const detail = engine.getDetail(workflow.id)
    await engine.decide(workflow.id, detail.steps[0].id, 'approve')

    const types = new Set(events.map((e) => e.type))
    expect(types.has('workflow.created')).toBe(true)
    expect(types.has('workflow.updated')).toBe(true)
    expect(types.has('step.updated')).toBe(true)
    expect(types.has('artifact.updated')).toBe(true)
    expect(types.has('decision.created')).toBe(true)
  })

  it('rejects invalid transitions', async () => {
    const { engine } = setup()
    const workflow = engine.createWorkflow({
      goal: '调研',
      steps: [{ label: '生成计划', role: 'planner', requiresApproval: true }],
    })
    await expect(engine.decide(workflow.id, 'nope', 'approve')).rejects.toBeInstanceOf(
      EngineError
    )
    await engine.start(workflow.id)
    await expect(engine.start(workflow.id)).rejects.toMatchObject({ status: 409 })
    const detail = engine.getDetail(workflow.id)
    await engine.decide(workflow.id, detail.steps[0].id, 'approve')
    await expect(
      engine.decide(workflow.id, detail.steps[0].id, 'approve')
    ).rejects.toMatchObject({ status: 400 })
  })
})
