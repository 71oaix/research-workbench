import { describe, expect, it, vi } from 'vitest'
import type { Artifact, Step } from '@research-workbench/shared'
import type { StepRunInput } from '../src/engine/StepRunner'
import { PiRuntimeProvider } from '../src/runtime/PiRuntimeProvider'
import { PiStepRunner } from '../src/runtime/PiStepRunner'
import type { ResearcherStepService } from '../src/search/types'

function makeResearcherStep(): Step {
  return {
    id: 'step-r',
    workflowId: 'wf-1',
    label: '检索文献',
    role: 'researcher',
    status: 'pending',
    position: 1,
    requiresApproval: false,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makePlanArtifact(): Artifact {
  return {
    id: 'a1',
    workflowId: 'wf-1',
    stepId: null,
    name: '01-plan.md',
    content: '## 检索关键词\n- RAG',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('PiStepRunner researcher branch', () => {
  it('runs the researcher step service and feeds cards into the model prompt', async () => {
    const handle = {
      id: 'h1',
      send: vi.fn().mockResolvedValue('# 检索结果'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider
    const researcher = {
      prepare: vi.fn().mockResolvedValue({ cardsMd: '# 检索证据卡片\n### [1] Paper' }),
    } as unknown as ResearcherStepService

    const runner = new PiStepRunner(provider, undefined, researcher)
    const input: StepRunInput = {
      step: makeResearcherStep(),
      goal: '调研',
      inputArtifacts: [makePlanArtifact()],
    }
    const result = await runner.run(input)

    expect(researcher.prepare).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      stepId: 'step-r',
      planContent: '## 检索关键词\n- RAG',
    })
    expect(handle.send).toHaveBeenCalledWith(
      expect.stringContaining('检索证据卡片（仅以此为事实来源）')
    )
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('### [1] Paper'))
    expect(result.artifactName).toBe('02-research.md')
  })

  it('fails fast when the plan artifact is missing', async () => {
    const handle = {
      id: 'h1',
      send: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider
    const researcher = { prepare: vi.fn() } as unknown as ResearcherStepService
    const runner = new PiStepRunner(provider, undefined, researcher)

    await expect(
      runner.run({ step: makeResearcherStep(), goal: '调研', inputArtifacts: [] })
    ).rejects.toThrow('01-plan.md')
    expect(handle.send).not.toHaveBeenCalled()
  })
})
