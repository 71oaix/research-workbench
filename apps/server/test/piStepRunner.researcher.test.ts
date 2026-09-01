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
    pendingFeedback: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makePlanArtifact(version: number, content: string): Artifact {
  return {
    id: 'a1',
    workflowId: 'wf-1',
    stepId: null,
    name: '01-plan.md',
    content,
    version,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('PiStepRunner researcher branch', () => {
  it('runs the researcher step service and feeds candidates into the model prompt', async () => {
    const handle = {
      id: 'h1',
      send: vi
        .fn()
        .mockResolvedValue(
          '# 检索结果\n\n## 候选\n- [1] Paper A 建立评测基础\n- [2] Paper B 提出改进方法，两者可互补'
        ),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider
    const researcher = {
      prepare: vi.fn().mockResolvedValue({ candidatesMd: '# 检索候选池\n### [1] Paper' }),
    } as unknown as ResearcherStepService

    const runner = new PiStepRunner(provider, undefined, researcher)
    const input: StepRunInput = {
      step: makeResearcherStep(),
      goal: '调研',
      inputArtifacts: [
        makePlanArtifact(1, '旧计划：无关键词'),
        makePlanArtifact(2, '新计划：## 检索关键词\n- RAG'),
      ],
    }
    const result = await runner.run(input)

    expect(researcher.prepare).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      stepId: 'step-r',
      planContent: '新计划：## 检索关键词\n- RAG',
      compensate: false,
    })
    expect(handle.send).toHaveBeenCalledWith(
      expect.stringContaining('检索候选池（仅以此为事实来源，未筛选）'),
      undefined
    )
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('### [1] Paper'), undefined)
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

  it('passes compensate=true when previous feedback is present', async () => {
    const handle = {
      id: 'h1',
      send: vi
        .fn()
        .mockResolvedValue(
          '# 补检检索结果\n\n按上一轮反馈扩大检索范围，补充三篇相关文献并给出完整证据编号与摘要，这些文献覆盖了此前遗漏的关键方法。'
        ),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider
    const researcher = {
      prepare: vi.fn().mockResolvedValue({ candidatesMd: '# candidates' }),
    } as unknown as ResearcherStepService
    const runner = new PiStepRunner(provider, undefined, researcher)

    await runner.run({
      step: makeResearcherStep(),
      goal: '调研',
      inputArtifacts: [makePlanArtifact(1, '## 检索关键词\n- RAG')],
      feedback: '论文太少，扩大检索',
    })

    expect(researcher.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ compensate: true })
    )
  })
})
