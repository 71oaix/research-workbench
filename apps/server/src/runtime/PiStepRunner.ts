import type { UsageRecord } from '@research-workbench/shared'
import type { StepRunInput, StepRunResult, StepRunner } from '../engine/StepRunner'
import { PiRuntimeProvider } from './PiRuntimeProvider'
import { ARTIFACT_NAMES, ROLE_SYSTEM_PROMPTS } from './prompts'

export class PiStepRunner implements StepRunner {
  constructor(
    private readonly provider: PiRuntimeProvider,
    private readonly onUsage?: (usage: Omit<UsageRecord, 'id' | 'createdAt'>) => void
  ) {}

  async run({ step, goal, inputArtifacts }: StepRunInput): Promise<StepRunResult> {
    const systemPrompt = ROLE_SYSTEM_PROMPTS[step.role]
    const handle = await this.provider.createRuntime(step.role, systemPrompt)
    try {
      const content = await handle.send(buildStepPrompt({ goal, step, inputArtifacts }))
      const usage = this.provider.takeUsage(handle.id)
      if (usage) {
        this.onUsage?.({
          workflowId: step.workflowId,
          stepId: step.id,
          role: step.role,
          ...usage,
        })
      }
      return { artifactName: ARTIFACT_NAMES[step.role], content }
    } finally {
      await handle.close()
    }
  }
}

function buildStepPrompt(input: StepRunInput): string {
  const artifactSummary =
    input.inputArtifacts.length > 0
      ? input.inputArtifacts
          .map((a) => `### ${a.name}（v${a.version}）\n${a.content}`)
          .join('\n\n')
      : '（暂无输入产物）'
  return [
    `研究问题（工作流目标）：${input.goal}`,
    ``,
    `## 工作流目标\n${input.goal}`,
    `## 当前步骤\n${input.step.label}（${input.step.role}）`,
    `## 已有产物\n${artifactSummary}`,
    `请完成当前步骤，输出 Markdown 产物。`,
  ].join('\n\n')
}
