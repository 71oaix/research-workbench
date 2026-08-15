import { describe, expect, it, vi } from 'vitest'
import type { Artifact, Step } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import type { StepRunInput } from '../src/engine/StepRunner'
import { EvidenceStepServiceImpl } from '../src/evidence/EvidenceStepService'
import { PiRuntimeProvider } from '../src/runtime/PiRuntimeProvider'
import { PiStepRunner } from '../src/runtime/PiStepRunner'

function makeStep(role: Step['role']): Step {
  return {
    id: `step-${role}`,
    workflowId: 'wf-1',
    label: role,
    role,
    status: 'pending',
    position: 1,
    requiresApproval: role === 'reviewer',
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

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

function makeProvider(handle: {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}) {
  return {
    createRuntime: vi.fn().mockResolvedValue(handle),
    takeUsage: vi.fn().mockReturnValue(null),
  } as unknown as PiRuntimeProvider
}

describe('PiStepRunner evidence branches', () => {
  it('injects evidence cards into the writer prompt', async () => {
    const handle = {
      send: vi.fn().mockResolvedValue('# 综述初稿'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const repos = createRepositories(createDb())
    const evidence = new EvidenceStepServiceImpl(repos, createEventBus())
    const runner = new PiStepRunner(makeProvider(handle), undefined, undefined, evidence)
    const cards = makeArtifact('research-cards.md', '### [1] Paper A')
    const input: StepRunInput = {
      step: makeStep('writer'),
      goal: '调研',
      inputArtifacts: [cards],
    }

    const result = await runner.run(input)

    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('证据池（仅以此为事实来源）'))
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('### [1] Paper A'))
    expect(result.artifactName).toBe('03-draft.md')
  })

  it('creates citation-lint.md and injects it into the reviewer prompt', async () => {
    const handle = {
      send: vi.fn().mockResolvedValue('# 审查意见'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const repos = createRepositories(createDb())
    const bus = createEventBus()
    const evidence = new EvidenceStepServiceImpl(repos, bus)
    const runner = new PiStepRunner(makeProvider(handle), undefined, undefined, evidence)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查引用',
      role: 'reviewer',
      position: 2,
      requiresApproval: true,
    })
    const cards = makeArtifact('research-cards.md', '### [1] Paper A\n### [2] Paper B')
    const draft = makeArtifact('03-draft.md', 'draft [1] and [99]')
    const input: StepRunInput = {
      step: { ...makeStep('reviewer'), id: step.id, workflowId: workflow.id },
      goal: '调研',
      inputArtifacts: [cards, draft],
    }

    const result = await runner.run(input)

    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('自动引用检查报告'))
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('越界 / 缺失编号：99'))
    expect(repos.artifacts.listByWorkflow(workflow.id).map((a) => a.name)).toContain(
      'citation-lint.md'
    )
    expect(result.artifactName).toBe('04-review.md')
  })

  it('fails fast when the writer has no evidence cards', async () => {
    const handle = {
      send: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const repos = createRepositories(createDb())
    const evidence = new EvidenceStepServiceImpl(repos, createEventBus())
    const runner = new PiStepRunner(makeProvider(handle), undefined, undefined, evidence)

    await expect(
      runner.run({ step: makeStep('writer'), goal: '调研', inputArtifacts: [] })
    ).rejects.toThrow('research-cards.md')
    expect(handle.send).not.toHaveBeenCalled()
  })
})
