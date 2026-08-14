import { describe, expect, it, vi } from 'vitest'
import type { Artifact, ServerEvent, Step } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import { EvidenceStepServiceImpl } from '../../src/evidence/EvidenceStepService'

function makeArtifact(name: string, content: string): Artifact {
  return {
    id: `a-${name}`,
    workflowId: 'wf-1',
    stepId: null,
    name,
    content,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makeStep(role: Step['role']): Step {
  return {
    id: 'step-1',
    workflowId: 'wf-1',
    label: role,
    role,
    status: 'pending',
    position: 0,
    requiresApproval: false,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('EvidenceStepServiceImpl', () => {
  it('prepareWriter returns a prompt section with the evidence cards', async () => {
    const repos = createRepositories(createDb())
    const bus = createEventBus()
    const service = new EvidenceStepServiceImpl(repos, bus)
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A'].join('\n')
    )

    const result = await service.prepareWriter({
      workflowId: 'wf-1',
      stepId: 'step-1',
      inputArtifacts: [cards],
    })

    expect(result.promptExtra).toContain('证据卡片（仅以此为事实来源）')
    expect(result.promptExtra).toContain('### [1] Paper A')
    expect(repos.artifacts.listByWorkflow('wf-1')).toHaveLength(0)
  })

  it('prepareReviewer creates citation-lint.md and includes it in the prompt', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((event) => events.push(event))
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查引用',
      role: 'reviewer',
      position: 2,
      requiresApproval: true,
    })
    const service = new EvidenceStepServiceImpl(repos, bus)
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A', '### [2] Paper B'].join('\n')
    )
    const draft = makeArtifact('03-draft.md', 'draft uses [1] and [99]')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, draft],
    })

    expect(result.promptExtra).toContain('自动引用检查报告')
    expect(result.promptExtra).toContain('越界 / 缺失编号：99')
    const lint = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'citation-lint.md')
    expect(lint?.content).toContain('引用检查报告')
    expect(events.some((event) => event.type === 'artifact.updated')).toBe(true)
  })

  it('throws when required artifacts are missing', async () => {
    const repos = createRepositories(createDb())
    const service = new EvidenceStepServiceImpl(repos, createEventBus())

    await expect(
      service.prepareWriter({ workflowId: 'wf-1', stepId: 's', inputArtifacts: [] })
    ).rejects.toThrow('research-cards.md')
    await expect(
      service.prepareReviewer({ workflowId: 'wf-1', stepId: 's', inputArtifacts: [] })
    ).rejects.toThrow('03-draft.md')
  })

  it('does not fail the service when the draft has no citations', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查',
      role: 'reviewer',
      position: 0,
      requiresApproval: true,
    })
    const cards = makeArtifact('research-cards.md', '### [1] Paper A')
    const draft = makeArtifact('03-draft.md', 'no citations')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, draft],
    })
    expect(result.promptExtra).toContain('未发现 [编号] 引用')
  })
})
