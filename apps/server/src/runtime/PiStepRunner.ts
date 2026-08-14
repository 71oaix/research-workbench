import type { UsageRecord } from '@research-workbench/shared'
import type { StepRunInput, StepRunResult, StepRunner } from '../engine/StepRunner'
import type { ResearcherStepService } from '../search/types'
import { PiRuntimeProvider } from './PiRuntimeProvider'
import { ARTIFACT_NAMES, ROLE_SYSTEM_PROMPTS } from './prompts'

export class PiStepRunner implements StepRunner {
  constructor(
    private readonly provider: PiRuntimeProvider,
    private readonly onUsage?: (usage: Omit<UsageRecord, 'id' | 'createdAt'>) => void,
    private readonly researcher?: ResearcherStepService
  ) {}

  async run({ step, goal, inputArtifacts }: StepRunInput): Promise<StepRunResult> {
    const systemPrompt = ROLE_SYSTEM_PROMPTS[step.role]
    const handle = await this.provider.createRuntime(step.role, systemPrompt)
    try {
      let prompt = buildStepPrompt({ goal, step, inputArtifacts })
      if (step.role === 'researcher' && this.researcher) {
        const plan = inputArtifacts.find((artifact) => artifact.name === '01-plan.md')
        if (!plan) {
          throw new Error('缺少 01-plan.md，无法执行学术检索')
        }
        const { cardsMd } = await this.researcher.prepare({
          workflowId: step.workflowId,
          stepId: step.id,
          planContent: plan.content,
        })
        prompt = buildResearcherPrompt({ goal, step, inputArtifacts, cardsMd })
      }
      const content = await handle.send(prompt)
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
          .map((artifact) => `### ${artifact.name}（v${artifact.version}）\n${artifact.content}`)
          .join('\n\n')
      : '（暂无输入产物）'
  return [
    `研究问题（工作流目标）：${input.goal}`,
    '',
    `## 工作流目标\n${input.goal}`,
    `## 当前步骤\n${input.step.label}（${input.step.role}）`,
    `## 已有产物\n${artifactSummary}`,
    '请完成当前步骤，输出 Markdown 产物。',
  ].join('\n\n')
}

function buildResearcherPrompt(input: {
  goal: string
  step: StepRunInput['step']
  inputArtifacts: StepRunInput['inputArtifacts']
  cardsMd: string
}): string {
  return [
    buildStepPrompt({ goal: input.goal, step: input.step, inputArtifacts: input.inputArtifacts }),
    '',
    '## 检索证据卡片（仅以此为事实来源）',
    input.cardsMd,
    '',
    '请基于检索证据卡片整理 `02-research.md`：',
    '1. 开头为检索概览：数据源、命中/去重数、失败源；',
    '2. 论文卡片列表保留 [编号]、标题、年份、作者、引用数、DOI/链接（缺失则省略）；',
    '3. 只使用卡片中出现的论文，不得新增或编造任何论文与引用。',
    '只输出 Markdown 正文。',
  ].join('\n\n')
}
