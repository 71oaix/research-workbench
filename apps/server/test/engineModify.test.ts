import { describe, expect, it } from 'vitest'
import type { StepSpec } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import type { StepRunInput, StepRunner } from '../src/engine/StepRunner'
import { WorkflowEngine } from '../src/engine/WorkflowEngine'

class CapturingRunner implements StepRunner {
  readonly feedbacks: (string | null)[] = []

  async run(input: StepRunInput) {
    this.feedbacks.push(input.feedback ?? null)
    const name: Record<string, string> = {
      planner: '01-plan.md',
      researcher: '02-research.md',
      writer: '03-draft.md',
      reviewer: '04-review.md',
    }
    const artifactName = name[input.step.role]
    return {
      artifactName,
      content: `# ${artifactName} 第 ${this.feedbacks.length} 版`,
    }
  }
}

function setup(steps: StepSpec[]) {
  const repos = createRepositories(createDb())
  const bus = createEventBus()
  const runner = new CapturingRunner()
  const engine = new WorkflowEngine(repos, runner, bus)
  const workflow = engine.createWorkflow({ goal: '调研', steps })
  return { repos, engine, runner, workflow }
}

describe('WorkflowEngine modify loop', () => {
  it('re-runs the planner with feedback and keeps artifact versions', async () => {
    const { engine, runner, workflow } = setup([
      { label: '规划', role: 'planner', requiresApproval: true },
      { label: '检索', role: 'researcher', requiresApproval: true },
    ])

    await engine.start(workflow.id)
    let detail = engine.getDetail(workflow.id)
    expect(detail.steps[0].status).toBe('awaiting_approval')

    await engine.decide(workflow.id, detail.steps[0].id, 'modify', '补充上下文工程方向')
    detail = engine.getDetail(workflow.id)

    expect(detail.workflow.status).toBe('paused')
    expect(detail.steps[0].status).toBe('awaiting_approval')
    expect(detail.steps[1].status).toBe('pending')
    expect(runner.feedbacks).toContain('补充上下文工程方向')
    expect(detail.decisions.some((decision) => decision.type === 'modify')).toBe(true)

    const planVersions = detail.artifacts
      .filter((artifact) => artifact.name === '01-plan.md')
      .map((artifact) => artifact.version)
    expect(planVersions).toEqual([1, 2])

    const plannerStep = detail.steps[0]
    expect(plannerStep.pendingFeedback).toBeNull()
  })

  it('reviewer modify sends feedback to the writer and re-runs both', async () => {
    const { engine, runner, workflow } = setup([
      { label: '规划', role: 'planner', requiresApproval: true },
      { label: '写作', role: 'writer', requiresApproval: true },
      { label: '审查', role: 'reviewer', requiresApproval: true },
    ])

    await engine.start(workflow.id)
    let detail = engine.getDetail(workflow.id)
    await engine.decide(workflow.id, detail.steps[0].id, 'approve')

    detail = engine.getDetail(workflow.id)
    expect(detail.steps[1].status).toBe('awaiting_approval')
    await engine.decide(workflow.id, detail.steps[1].id, 'approve')

    detail = engine.getDetail(workflow.id)
    expect(detail.steps[2].status).toBe('awaiting_approval')
    await engine.decide(workflow.id, detail.steps[2].id, 'modify', '引言太短，补充研究背景')

    detail = engine.getDetail(workflow.id)
    expect(detail.workflow.status).toBe('paused')
    expect(detail.steps[1].status).toBe('awaiting_approval')
    expect(detail.steps[2].status).toBe('pending')
    expect(runner.feedbacks).toContain('引言太短，补充研究背景')

    const draftVersions = detail.artifacts
      .filter((artifact) => artifact.name === '03-draft.md')
      .map((artifact) => artifact.version)
    expect(draftVersions).toEqual([1, 2])
  })
})
