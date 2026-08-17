import type { Artifact } from '@research-workbench/shared'
import type { Repositories } from '@research-workbench/data'
import { findLatestArtifact } from '../artifacts'
import { buildCitationLint } from '../citations/lint'
import type { WorkflowEventBus } from '../engine/eventBus'
import { verifyCitations } from './citationVerifier'
import type { CitationVerifierDeps } from './citationVerifier'
import { buildEvaluationInputs } from './evaluation'
import { buildEvidencePool } from './evidencePool'

export interface EvidenceStepService {
  prepareEvaluator(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }>
  prepareWriter(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }>
  prepareReviewer(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }>
}

export class EvidenceStepServiceImpl implements EvidenceStepService {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus,
    private readonly verifierDeps?: CitationVerifierDeps
  ) {}

  async prepareWriter(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }> {
    const pool = buildEvidencePool(input.inputArtifacts)
    if (pool.cardIds.length === 0) {
      throw new Error('缺少 research-cards.md，无法撰写综述')
    }
    const fullText = findLatestArtifact(input.inputArtifacts, 'paper-fulltext.md')
    return {
      promptExtra: buildWriterSection(
        pool.cardsMd,
        fullText ? buildFullTextExcerpts(fullText.content) : null
      ),
    }
  }

  async prepareEvaluator(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }> {
    const pool = buildEvidencePool(input.inputArtifacts)
    if (pool.cardIds.length === 0) {
      throw new Error('缺少 research-cards.md，无法评估')
    }
    const draft = findLatestArtifact(input.inputArtifacts, '03-draft.md')
    const plan = findLatestArtifact(input.inputArtifacts, '01-plan.md')
    const rawCards = findLatestArtifact(input.inputArtifacts, 'research-cards.md')
    const references = buildEvaluationInputs({
      planMd: plan?.content ?? '',
      draftMd: draft?.content ?? '',
      cardsMd: pool.cardsMd,
      rawCardsMd: rawCards?.content ?? '',
      cards: pool.cards,
    })
    return {
      promptExtra: buildEvaluatorSection(
        pool.cardsMd,
        draft?.content ?? '（缺少草稿）',
        references.md
      ),
    }
  }

  async prepareReviewer(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }> {
    const draft = findLatestArtifact(input.inputArtifacts, '03-draft.md')
    const plan = findLatestArtifact(input.inputArtifacts, '01-plan.md')
    const rawCards = findLatestArtifact(input.inputArtifacts, 'research-cards.md')
    const pool = buildEvidencePool(input.inputArtifacts)
    if (!draft || pool.cardIds.length === 0) {
      throw new Error('缺少 03-draft.md 或 research-cards.md，无法审查引用')
    }
    const lintMd = buildCitationLint(draft.content, pool.cardIds)
    const lintArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'citation-lint.md',
      content: lintMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact: lintArtifact })

    let verificationMd: string | null = null
    if (this.verifierDeps) {
      const report = await verifyCitations({
        draft: draft.content,
        cards: pool.cards,
        deps: this.verifierDeps,
      })
      const verificationArtifact = this.repos.artifacts.create({
        workflowId: input.workflowId,
        stepId: input.stepId,
        name: 'citation-verification.md',
        content: report.md,
      })
      this.bus.emit({ type: 'artifact.updated', artifact: verificationArtifact })
      verificationMd = report.md
    }

    const evaluation = findLatestArtifact(input.inputArtifacts, 'evaluation-report.md')
    const fullText = findLatestArtifact(input.inputArtifacts, 'paper-fulltext.md')
    const fullTextExcerpts = fullText ? buildFullTextExcerpts(fullText.content) : null

    return {
      promptExtra: buildReviewerSection({
        draft,
        cardsMd: pool.cardsMd,
        lintMd,
        verificationMd,
        evaluationMd: evaluation?.content ?? '（缺少评估报告，本次未执行模型评估）',
        fullTextExcerpts,
      }),
    }
  }
}

function buildEvaluatorSection(cardsMd: string, draftMd: string, referencesMd: string): string {
  return [
    '## 评估材料',
    '',
    '### 证据池卡片',
    cardsMd,
    '',
    '### 综述草稿（评估对象）',
    draftMd,
    '',
    referencesMd,
    '',
    '评估要求：按系统提示词输出结构化评估报告；每项判定必须给理由；',
    '至少列出 2 条覆盖不足方向；不要顺着草稿说好话。',
  ].join('\n\n')
}

function buildWriterSection(cardsMd: string, fullTextExcerpts: string | null): string {
  const sections = ['## 证据池（仅以此为事实来源）', cardsMd]
  if (fullTextExcerpts) {
    sections.push('## 论文全文摘录（仅前 3 篇，其余论文只用摘要）', fullTextExcerpts)
  }
  sections.push(
    '',
    '写作要求：',
    '1. 先用一句话概括核心论点（一句话论点），再给出段落图（每段只做一件事）；',
    '2. 从证据向外写，每个论点用 [编号] 标注证据池中的卡片；',
    '3. 动词与证据强度匹配：只写“报告/表明/与…一致”，不要写成“证明/首次/前所未有”；',
    '4. 只有摘录区内提供全文摘录的论文可引用其细节；未提供摘录的论文只能引其摘要可支撑的结论；',
    '5. 文末附“参考文献”与“claim-evidence map”，每条格式为 Claim | Evidence | Status；',
    '6. 只使用证据池中的论文，不得编造引用。'
  )
  return sections.join('\n\n')
}

/**
 * 从 paper-fulltext.md 中提取“标题 + 首尾摘录”，只保留排名最靠前的 3 篇全文摘录。
 * 其余论文在证据池卡片中只有摘要，控制 writer 上下文规模。
 */
function buildFullTextExcerpts(
  fullTextMd: string,
  maxFullExcerpts = 3,
  excerptChars = 5000
): string {
  const sections = splitFullTextSections(fullTextMd)
  const excerpts = sections
    .slice(0, maxFullExcerpts)
    .map(({ number, title, body }) => {
      const excerpt = excerptBody(body, excerptChars)
      return [`### [${number}] ${title}`, '', excerpt, '', '> 以上为全文摘录（非全文），其余章节以卡片摘要为准。'].join('\n')
    })
  if (excerpts.length === 0) return ''
  return [
    `全文已读 ${sections.length} 篇，本区仅注入前 ${Math.min(
      maxFullExcerpts,
      sections.length
    )} 篇摘录，其余论文仅可引摘要。`,
    '',
    ...excerpts,
  ].join('\n\n')
}

function splitFullTextSections(fullTextMd: string): { number: number; title: string; body: string }[] {
  const lines = fullTextMd.split('\n')
  const sections: { number: number; title: string; body: string[] }[] = []
  let current: { number: number; title: string; body: string[] } | null = null
  for (const line of lines) {
    const match = line.match(/^##\s*\[(\d{1,4})\]\s*(.*)$/)
    if (match) {
      current = { number: Number(match[1]), title: match[2].trim(), body: [] }
      sections.push(current)
      continue
    }
    current?.body.push(line)
  }
  return sections.map(({ number, title, body }) => ({
    number,
    title,
    body: body.join('\n').trim(),
  }))
}

function excerptBody(body: string, max: number): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  const head = trimmed.slice(0, Math.floor(max * 0.7))
  const tail = trimmed.slice(-Math.floor(max * 0.3))
  return `${head}\n\n……（中间部分省略，共 ${trimmed.length} 字符）……\n\n${tail}`
}

function buildReviewerSection(input: {
  draft: Artifact
  cardsMd: string
  lintMd: string
  verificationMd: string | null
  evaluationMd: string
  fullTextExcerpts: string | null
}): string {
  const sections = [
    '## 待审查草稿',
    input.draft.content,
    '',
    '## 证据池',
    input.cardsMd,
    '',
    '## 自动引用检查报告',
    input.lintMd,
  ]
  if (input.verificationMd) {
    sections.push('', '## 自动引用核验报告（Crossref 字段级交叉）', input.verificationMd)
  }
  if (input.fullTextExcerpts) {
    sections.push('', '## 关键全文摘录（供全文级核验）', input.fullTextExcerpts)
  }
  sections.push('', '## 模型评估报告（逐概念 / 相关度 / 大纲覆盖 / gap）', input.evaluationMd)
  sections.push(
    '',
    '审查要求：',
    '1. 输出“可信引用清单 / 存疑引用与原因 / 覆盖不足的方向 / 总体结论”；',
    '2. 以自动检查报告为计数依据，不要自行数引用；',
    '3. 只对证据池中存在的论文做判断，证据不足时写 Not assessable。',
  )
  return sections.join('\n')
}
