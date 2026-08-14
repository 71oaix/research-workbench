import type { Artifact } from '@research-workbench/shared'
import type { Repositories } from '@research-workbench/data'
import { buildCitationLint } from '../citations/lint'
import type { WorkflowEventBus } from '../engine/eventBus'
import { extractCardIds } from '../search/cards'

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
    private readonly bus: WorkflowEventBus
  ) {}

  async prepareWriter(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }> {
    const cards = findArtifact(input.inputArtifacts, 'research-cards.md')
    if (!cards) {
      throw new Error('缺少 research-cards.md，无法撰写综述')
    }
    return { promptExtra: buildWriterSection(cards.content) }
  }

  async prepareReviewer(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{ promptExtra: string }> {
    const draft = findArtifact(input.inputArtifacts, '03-draft.md')
    const cards = findArtifact(input.inputArtifacts, 'research-cards.md')
    if (!draft || !cards) {
      throw new Error('缺少 03-draft.md 或 research-cards.md，无法审查引用')
    }

    const lintMd = buildCitationLint(draft.content, extractCardIds(cards.content))
    const artifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'citation-lint.md',
      content: lintMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact })

    return { promptExtra: buildReviewerSection({ draft, cards, lintMd }) }
  }
}

function findArtifact(artifacts: Artifact[], name: string): Artifact | null {
  return artifacts.find((artifact) => artifact.name === name) ?? null
}

function buildWriterSection(cardsMd: string): string {
  return [
    '## 证据卡片（仅以此为事实来源）',
    cardsMd,
    '',
    '写作要求：',
    '1. 输出结构化综述初稿（引言 + 2-4 个章节 + 小结）；',
    '2. 每个论点用 [编号] 标注对应卡片；',
    '3. 文末附“参考文献”列表，映射 [编号] → 标题 / 年份 / DOI / 链接；',
    '4. 只引用卡片中存在的论文，不得编造。',
  ].join('\n')
}

function buildReviewerSection(input: {
  draft: Artifact
  cards: Artifact
  lintMd: string
}): string {
  return [
    '## 待审查草稿',
    input.draft.content,
    '',
    '## 证据卡片',
    input.cards.content,
    '',
    '## 自动引用检查报告',
    input.lintMd,
    '',
    '审查要求：',
    '1. 输出“可信引用清单 / 存疑引用与原因 / 覆盖不足的方向 / 总体结论”；',
    '2. 以自动检查报告为计数依据，不要自行数引用；',
    '3. 只对卡片中存在的论文做判断。',
  ].join('\n')
}
