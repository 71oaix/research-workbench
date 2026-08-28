import type { Artifact, UsageRecord } from '@research-workbench/shared'
import { findLatestArtifact } from '../artifacts'
import { EngineError } from '../engine/WorkflowEngine'
import type { StepRunInput, StepRunResult, StepRunner } from '../engine/StepRunner'
import type { EvidenceStepService } from '../evidence/EvidenceStepService'
import type { ResearcherStepService, SelectorStepService } from '../search/types'
import { buildReviewSpecPrompt, buildSearchSpecPrompt, buildWritingSpecPrompt } from '../specs'
import { PiRuntimeProvider, type StreamDeltaCallback, type StreamKind } from './PiRuntimeProvider'
import { ARTIFACT_NAMES, ROLE_SYSTEM_PROMPTS } from './prompts'

export class PiStepRunner implements StepRunner {
  constructor(
    private readonly provider: PiRuntimeProvider,
    private readonly onUsage?: (usage: Omit<UsageRecord, 'id' | 'createdAt'>) => void,
    private readonly researcher?: ResearcherStepService,
    private readonly evidence?: EvidenceStepService,
    private readonly selector?: SelectorStepService,
    private readonly onStream?: (workflowId: string, stepId: string, kind: StreamKind, delta: string) => void,
    private readonly onCancellable?: (workflowId: string, abort: () => Promise<void>) => void,
    private readonly onCancellableEnd?: (workflowId: string) => void,
    /** 取消轮询：session.abort 只能中断活跃流，send 间隙靠此检查点拦截 */
    private readonly isCancelled?: (workflowId: string) => boolean
  ) {}

  private ensureNotCancelled(workflowId: string): void {
    if (this.isCancelled?.(workflowId)) {
      throw new EngineError('workflow_cancelled', 499)
    }
  }

  async run({ step, goal, inputArtifacts, feedback }: StepRunInput): Promise<StepRunResult> {
    // summarizer 为确定性归纳整理，不调用模型
    if (step.role === 'summarizer' && this.evidence) {
      const { summaryMd } = await this.evidence.prepareSummarizer({
        workflowId: step.workflowId,
        stepId: step.id,
        inputArtifacts,
      })
      return { artifactName: '05-summary.md', content: summaryMd }
    }
    const systemPrompt =
      ROLE_SYSTEM_PROMPTS[step.role] +
      (step.role === 'researcher'
        ? buildSearchSpecPrompt()
        : step.role === 'writer'
          ? buildWritingSpecPrompt()
          : step.role === 'reviewer'
            ? buildReviewSpecPrompt()
          : '')
    const handle = await this.provider.createRuntime(step.role, systemPrompt)
    this.ensureNotCancelled(step.workflowId)
    this.onCancellable?.(step.workflowId, () => handle.abort())
    try {
      let prompt = buildStepPrompt({ goal, step, inputArtifacts, feedback })
      let selectorPrepare: Awaited<ReturnType<SelectorStepService['prepare']>> | null = null
      if (step.role === 'researcher' && this.researcher) {
        const plan = findLatestArtifact(inputArtifacts, '01-plan.md')
        if (!plan) {
          throw new Error('缺少 01-plan.md，无法执行学术检索')
        }
        const { candidatesMd } = await this.researcher.prepare({
          workflowId: step.workflowId,
          stepId: step.id,
          planContent: plan.content,
          compensate: Boolean(feedback),
        })
        prompt = buildResearcherPrompt({ goal, step, inputArtifacts, candidatesMd, feedback })
      }
      if (step.role === 'evaluator' && this.evidence) {
        const { promptExtra } = await this.evidence.prepareEvaluator({
          workflowId: step.workflowId,
          stepId: step.id,
          inputArtifacts,
        })
        prompt = `${prompt}\n\n${promptExtra}`
      } else if (step.role === 'writer' && this.evidence) {
        const { promptExtra } = await this.evidence.prepareWriter({
          workflowId: step.workflowId,
          stepId: step.id,
          inputArtifacts,
        })
        prompt = `${prompt}\n\n${promptExtra}`
      } else if (step.role === 'reviewer' && this.evidence) {
        const { promptExtra } = await this.evidence.prepareReviewer({
          workflowId: step.workflowId,
          stepId: step.id,
          inputArtifacts,
        })
        prompt = `${prompt}\n\n${promptExtra}`
      } else if (step.role === 'selector' && this.selector) {
        const prepared = await this.selector.prepare({
          workflowId: step.workflowId,
          stepId: step.id,
          inputArtifacts,
        })
        selectorPrepare = prepared
        prompt = `${prompt}\n\n${prepared.promptExtra}`
      }
      const streamDelta: StreamDeltaCallback | undefined = this.onStream
        ? (kind, delta) => this.onStream?.(step.workflowId, step.id, kind, delta)
        : undefined
      this.ensureNotCancelled(step.workflowId)
      const content = await handle.send(prompt, streamDelta)
      this.recordUsage(step, handle.id)

      if (step.role === 'selector' && this.selector && selectorPrepare) {
        const { nextPrompt, state } = await this.selector.stage({
          output: content,
          candidates: selectorPrepare.candidates,
          planContent: selectorPrepare.planContent,
          stats: selectorPrepare.stats,
          groups: selectorPrepare.groups,
        })
        let nextOutput: string | null = null
        if (nextPrompt) {
          this.ensureNotCancelled(step.workflowId)
          nextOutput = await handle.send(nextPrompt, streamDelta)
          this.recordUsage(step, handle.id)
        }
        this.ensureNotCancelled(step.workflowId)
        const { cardsMd } = await this.selector.commit({
          workflowId: step.workflowId,
          stepId: step.id,
          state,
          nextOutput,
        })
        return { artifactName: 'research-cards.md', content: cardsMd }
      }
      return { artifactName: ARTIFACT_NAMES[step.role], content }
    } finally {
      this.onCancellableEnd?.(step.workflowId)
      await handle.close()
    }
  }

  private recordUsage(step: StepRunInput['step'], handleId: string): void {
    const usage = this.provider.takeUsage(handleId)
    if (usage) {
      this.onUsage?.({
        workflowId: step.workflowId,
        stepId: step.id,
        role: step.role,
        ...usage,
      })
    }
  }
}

function buildStepPrompt(input: StepRunInput): string {
  const latestDraftVersion = Math.max(
    0,
    ...input.inputArtifacts
      .filter((artifact) => artifact.name === '03-draft.md')
      .map((artifact) => artifact.version)
  )
  const hasFeedback = Boolean(input.feedback)
  const artifactSummary =
    input.inputArtifacts.length > 0
      ? input.inputArtifacts
          .map(
            (artifact) =>
              `### ${artifact.name}（v${artifact.version}）\n${compactArtifact(
                artifact,
                latestDraftVersion,
                hasFeedback
              )}`
          )
          .join('\n\n')
      : '（暂无输入产物）'
  const sections = [
    `研究问题（工作流目标）：${input.goal}`,
    '',
    `## 工作流目标\n${input.goal}`,
    `## 当前步骤\n${input.step.label}（${input.step.role}）`,
    `## 已有产物\n${artifactSummary}`,
  ]
  if (input.feedback) {
    sections.push(`## 上一轮修改意见\n${input.feedback}`)
  }
  sections.push('请完成当前步骤，输出 Markdown 产物；如有上一轮修改意见，先逐条响应。')
  return sections.join('\n\n')
}

/**
 * 控制步骤上下文规模：
 * - paper-fulltext.md 由写作证据区以摘录形式单独注入，不在通用产物区重复全量注入；
 * - 打回重跑时，草稿一律只注入结构摘要（章节 + 引用 + 篇幅）；无打回时历史版本草稿同样只注入结构摘要，
 *   避免 prompt 随迭代翻倍。
 */
function compactArtifact(
  artifact: Artifact,
  latestDraftVersion: number,
  hasFeedback: boolean
): string {
  if (artifact.name === 'paper-fulltext.md') {
    return '（全文摘录由写作证据区单独注入，此处省略全文，避免上下文膨胀）'
  }
  if (
    artifact.name === '03-draft.md' &&
    (hasFeedback || artifact.version < latestDraftVersion)
  ) {
    return digestDraft(artifact.content)
  }
  return artifact.content
}

function digestDraft(content: string): string {
  const headings = content.match(/^#{1,4}\s+.+$/gm) ?? []
  const refs = [...new Set([...content.matchAll(/\[(\d{1,4})\]/g)].map((match) => match[1]))]
  return [
    '【历史版本结构摘要，供打回重写参考】',
    `- 章节：${headings.length > 0 ? headings.join(' / ') : '（无标题）'}`,
    `- 引用编号：${refs.length > 0 ? refs.join(', ') : '（无）'}`,
    `- 篇幅：约 ${content.length} 字符`,
    '请结合“上一轮修改意见”重写，不要整段复制历史版本。',
  ].join('\n')
}

function buildResearcherPrompt(input: {
  goal: string
  step: StepRunInput['step']
  inputArtifacts: StepRunInput['inputArtifacts']
  candidatesMd: string
  feedback?: string | null
}): string {
  return [
    buildStepPrompt({
      goal: input.goal,
      step: input.step,
      inputArtifacts: input.inputArtifacts,
      feedback: input.feedback,
    }),
    '',
    '## 检索候选池（仅以此为事实来源，未筛选）',
    input.candidatesMd,
    '',
    '请基于检索候选池整理 `02-research.md`：',
    '1. 开头为检索概览：数据源、命中/去重数、失败源；',
    '2. 论文卡片列表保留 [编号]、标题、年份、作者、引用数、DOI/链接（缺失则省略）；',
    '3. 只使用卡片中出现的论文，不得新增或编造任何论文与引用。',
    '只输出 Markdown 正文。',
  ].join('\n\n')
}
