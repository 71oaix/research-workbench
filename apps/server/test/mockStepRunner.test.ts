import { describe, expect, it } from 'vitest'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import { MockStepRunner } from '../src/runtime/MockStepRunner'

describe('MockStepRunner', () => {
  it('produces role artifacts with expected structure', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const workflow = repos.workflows.create('演示调研')
    const runner = new MockStepRunner(repos, bus)
    const artifactNames = () =>
      repos.artifacts.listByWorkflow(workflow.id).map((artifact) => artifact.name)
    const plannerStep = repos.steps.create({
      workflowId: workflow.id,
      label: '规划',
      role: 'planner',
      position: 0,
      requiresApproval: true,
    })
    const researcherStep = repos.steps.create({
      workflowId: workflow.id,
      label: '检索',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })
    const writerStep = repos.steps.create({
      workflowId: workflow.id,
      label: '写作',
      role: 'writer',
      position: 2,
      requiresApproval: false,
    })
    const reviewerStep = repos.steps.create({
      workflowId: workflow.id,
      label: '审查',
      role: 'reviewer',
      position: 3,
      requiresApproval: true,
    })

    const planner = await runner.run({
      step: plannerStep,
      goal: '演示调研',
      inputArtifacts: [],
      feedback: '补充上下文工程方向',
    })
    expect(planner.artifactName).toBe('01-plan.md')
    expect(planner.content).toContain('检索关键词')
    expect(planner.content).toContain('已按审批意见修订：补充上下文工程方向')

    const researcher = await runner.run({
      step: researcherStep,
      goal: '演示调研',
      inputArtifacts: [toArtifact(planner)],
    })
    expect(researcher.artifactName).toBe('02-research.md')
    expect(artifactNames()).toContain('research-cards.md')

    const writer = await runner.run({
      step: writerStep,
      goal: '演示调研',
      inputArtifacts: [],
      feedback: '引言太短',
    })
    expect(writer.artifactName).toBe('03-draft.md')
    expect(writer.content).toContain('[1]')
    expect(writer.content).toContain('参考文献')
    expect(writer.content).toContain('已按审批意见修订：引言太短')

    const reviewer = await runner.run({
      step: reviewerStep,
      goal: '演示调研',
      inputArtifacts: [],
    })
    expect(reviewer.artifactName).toBe('04-review.md')
    expect(reviewer.content).toContain('可信引用清单')
    expect(artifactNames()).toContain('citation-lint.md')
  })
})

function toArtifact(result: { artifactName: string; content: string }) {
  return {
    id: `a-${result.artifactName}`,
    workflowId: 'wf-1',
    stepId: null,
    name: result.artifactName,
    content: result.content,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
