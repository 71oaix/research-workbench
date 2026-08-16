import type { Artifact } from '@research-workbench/shared'
import type { Repositories } from '@research-workbench/data'
import { findLatestArtifact } from '../artifacts'
import { buildCitationLint } from '../citations/lint'
import type { WorkflowEventBus } from '../engine/eventBus'
import { verifyCitations } from './citationVerifier'
import type { CitationVerifierDeps } from './citationVerifier'
import { buildEvaluationReport } from './evaluation'
import { buildEvidencePool } from './evidencePool'

export interface EvidenceStepService {
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
      promptExtra: buildWriterSection(pool.cardsMd, fullText?.content ?? null),
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

    const evaluation = buildEvaluationReport({
      planMd: plan?.content ?? '',
      draftMd: draft.content,
      cardsMd: pool.cardsMd,
      rawCardsMd: rawCards?.content ?? '',
      cards: pool.cards,
    })
    const evaluationArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'evaluation-report.md',
      content: evaluation.md,
    })
    this.bus.emit({ type: 'artifact.updated', artifact: evaluationArtifact })

    return {
      promptExtra: buildReviewerSection({
        draft,
        cardsMd: pool.cardsMd,
        lintMd,
        verificationMd,
        evaluationMd: evaluation.md,
      }),
    }
  }
}

function buildWriterSection(cardsMd: string, fullTextMd: string | null): string {
  const sections = ['## 证据池（仅以此为事实来源）', cardsMd]
  if (fullTextMd) {
    sections.push('## 论文全文（阅读证据）', fullTextMd)
  }
  sections.push(
    '',
    '写作要求：',
    '1. 先用一句话概括核心论点（一句话论点），再给出段落图（每段只做一件事）；',
    '2. 从证据向外写，每个论点用 [编号] 标注证据池中的卡片；',
    '3. 动词与证据强度匹配：只写“报告/表明/与…一致”，不要写成“证明/首次/前所未有”；',
    '4. 未读全文的论文只能引其摘要可支撑的结论，不得展开；',
    '5. 文末附“参考文献”与“claim-evidence map”，每条格式为 Claim | Evidence | Status；',
    '6. 只使用证据池中的论文，不得编造引用。'
  )
  return sections.join('\n\n')
}

function buildReviewerSection(input: {
  draft: Artifact
  cardsMd: string
  lintMd: string
  verificationMd: string | null
  evaluationMd: string
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
  sections.push('', '## 自动评估报告（主题 / 相关度 / 覆盖 / 来源）', input.evaluationMd)
  sections.push(
    '',
    '审查要求：',
    '1. 输出“可信引用清单 / 存疑引用与原因 / 覆盖不足的方向 / 总体结论”；',
    '2. 以自动检查报告为计数依据，不要自行数引用；',
    '3. 只对证据池中存在的论文做判断，证据不足时写 Not assessable。',
  )
  return sections.join('\n')
}
