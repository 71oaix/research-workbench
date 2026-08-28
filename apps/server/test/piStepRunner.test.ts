import { describe, expect, it, vi } from 'vitest'
import type { Step } from '@research-workbench/shared'
import type { StepRunInput } from '../src/engine/StepRunner'
import { PiRuntimeProvider } from '../src/runtime/PiRuntimeProvider'
import { PiStepRunner } from '../src/runtime/PiStepRunner'

function makeStep(role: Step['role']): Step {
  return {
    id: 'step-1',
    workflowId: 'wf-1',
    label: '生成检索计划',
    role,
    status: 'pending',
    position: 0,
    requiresApproval: true,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('PiStepRunner', () => {
  it('builds prompt with goal/artifacts and returns role artifact name', async () => {
    const handle = {
      id: 'h1',
      send: vi.fn().mockResolvedValue('# 检索计划\n...'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider

    const runner = new PiStepRunner(provider)
    const input: StepRunInput = {
      step: makeStep('planner'),
      goal: '调研 LLM 测试',
      inputArtifacts: [],
    }
    const result = await runner.run(input)

    expect(provider.createRuntime).toHaveBeenCalledWith(
      'planner',
      expect.stringContaining('规划智能体')
    )
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('调研 LLM 测试'), undefined)
    expect(result.artifactName).toBe('01-plan.md')
    expect(result.content).toContain('检索计划')
  })

  it('records usage when available', async () => {
    const handle = {
      id: 'h1',
      send: vi.fn().mockResolvedValue('ok'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue({
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costCny: 0.01,
      }),
    } as unknown as PiRuntimeProvider
    const onUsage = vi.fn()
    const runner = new PiStepRunner(provider, onUsage)

    await runner.run({ step: makeStep('planner'), goal: 'g', inputArtifacts: [] })

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf-1', stepId: 'step-1', role: 'planner' })
    )
  })

  it('injects the previous round feedback into the prompt', async () => {
    const handle = {
      id: 'h1',
      send: vi.fn().mockResolvedValue('ok'),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const provider = {
      createRuntime: vi.fn().mockResolvedValue(handle),
      takeUsage: vi.fn().mockReturnValue(null),
    } as unknown as PiRuntimeProvider
    const runner = new PiStepRunner(provider)

    await runner.run({
      step: makeStep('planner'),
      goal: 'g',
      inputArtifacts: [],
      feedback: '补充上下文工程方向',
    })

    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('上一轮修改意见'), undefined)
    expect(handle.send).toHaveBeenCalledWith(expect.stringContaining('补充上下文工程方向'), undefined)
  })
})
