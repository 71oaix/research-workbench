import path from 'node:path'
import type { Artifact } from '@research-workbench/shared'
import type { Repositories } from '@research-workbench/data'
import { findLatestArtifact } from '../artifacts'
import type { WorkflowEventBus } from '../engine/eventBus'
import { acquireFullText, fullTextKey } from '../evidence/fullText'
import type { AcademicSearchService } from './AcademicSearchService'
import { buildResearchCandidates, buildResearchCards } from './cards'
import type { SearchConfig } from './config'
import { mergeAndRank } from './merge'
import { OpenAlexClient } from './openAlex'
import type {
  KeywordGroup,
  MergedPaper,
  SearchStats,
  SearchPaper,
  SelectorSelection,
  SelectorStageState,
  SelectorStepService,
} from './types'

const SNOWBALL_TOP = 3
const SNOWBALL_PER_WORK = 10
const SNOWBALL_REF_CAP = 10
const GAP_MAX = 4
const RE_SCREEN_REASON_LIMIT = 120

interface CandidateBundle {
  stats: SearchStats
  groups: KeywordGroup[]
  papers: MergedPaper[]
}

export class SelectorStepServiceImpl implements SelectorStepService {
  constructor(
    private readonly search: AcademicSearchService,
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus,
    private readonly config: SearchConfig
  ) {}

  async prepare(input: {
    workflowId: string
    stepId: string
    inputArtifacts: Artifact[]
  }): Promise<{
    promptExtra: string
    candidates: MergedPaper[]
    planContent: string
    stats: SearchStats
    groups: KeywordGroup[]
  }> {
    const candidatesArtifact = findLatestArtifact(input.inputArtifacts, 'research-candidates.json')
    const candidatesMdArtifact = findLatestArtifact(input.inputArtifacts, 'research-candidates.md')
    const plan = findLatestArtifact(input.inputArtifacts, '01-plan.md')
    if (!candidatesArtifact || !candidatesMdArtifact || !plan) {
      throw new Error('缺少 research-candidates 或 01-plan.md，无法执行筛选')
    }
    const bundle = parseCandidateBundle(candidatesArtifact.content)
    const candidates = bundle.papers
    const promptExtra = [
      '## 检索候选池（逐篇判定，编号必须一致）',
      candidatesMdArtifact.content,
      '',
      '## 研究计划（锚点）',
      compactPlan(plan.content),
      '',
      `要求：对候选池中的每篇论文输出“### [N] 判定：入选/剔除”；`,
      `相关度只填“高/部分”；理由 ≤${RE_SCREEN_REASON_LIMIT} 字；`,
      `最后输出“## 二次检索建议”小节（2-4 条）。`,
    ].join('\n\n')
    return {
      promptExtra,
      candidates,
      planContent: plan.content,
      stats: bundle.stats,
      groups: bundle.groups,
    }
  }

  async stage(input: {
    output: string
    candidates: MergedPaper[]
    planContent: string
    stats: SearchStats
    groups: KeywordGroup[]
  }): Promise<{ nextPrompt: string | null; state: SelectorStageState }> {
    const parsed = parseSelectorOutput(input.output)
    const selections =
      parsed.selections.length > 0
        ? parsed.selections
        : input.candidates.map((_, index) => ({
            index: index + 1,
            selected: true,
            level: null,
            reason: '（筛选输出解析失败，回退全量入选）',
          }))
    const gapQueries = parsed.gapQueries.slice(0, GAP_MAX)

    // 引文雪球：对入选且来自 OpenAlex 的 top-3 论文做被引/参考文献扩展
    const snowballPapers = await this.snowball(selections, input.candidates)

    // gap 二次检索：只跑建议查询，不复跑基础查询
    let gapPapers: MergedPaper[] = []
    if (gapQueries.length > 0) {
      const gapOutput = await this.search.search(input.planContent, {
        gapQueries,
        onlyGapQueries: true,
      })
      gapPapers = gapOutput.papers
    }

    // 合并去重：与原始候选池按 doi/arxiv/标题 去重，只保留新增论文
    const originalKeys = new Set(input.candidates.map((paper) => fullTextKey(paper)))
    const merged = mergeAndRank([...input.candidates, ...snowballPapers, ...gapPapers], 200)
    const newPapers = merged.papers.filter((paper) => !originalKeys.has(fullTextKey(paper)))

    let nextPrompt: string | null = null
    if (newPapers.length > 0) {
      const bundle: CandidateBundle = {
        stats: emptyStats(gapQueries.length),
        groups: gapQueries.map((query, index) => ({ label: `gap-${index + 1}`, query })),
        papers: newPapers,
      }
      nextPrompt = [
        '## 二次检索 / 引文雪球新增候选（只需判定这些新增论文）',
        buildResearchCandidates(newPapers, bundle.stats, bundle.groups),
        '',
        `要求：对每篇新增论文输出“### [N] 判定：入选/剔除”；相关度只填“高/部分”；`,
        `理由 ≤${RE_SCREEN_REASON_LIMIT} 字；不要输出“二次检索建议”。`,
      ].join('\n\n')
    }

    const state: SelectorStageState = {
      candidates: input.candidates,
      selections,
      gapQueries,
      newPapers,
      stats: input.stats,
      groups: input.groups,
    }
    return { nextPrompt, state }
  }

  async commit(input: {
    workflowId: string
    stepId: string
    state: SelectorStageState
    nextOutput: string | null
  }): Promise<{ cardsMd: string }> {
    const { state } = input
    const parsedNew = input.nextOutput ? parseSelectorOutput(input.nextOutput).selections : []
    const newSelections =
      input.nextOutput && parsedNew.length === 0
        ? state.newPapers.map((_, index) => ({
            index: index + 1,
            selected: true,
            level: null,
            reason: '（重筛输出解析失败，回退全量入选）',
          }))
        : parsedNew

    const selectedFromCandidates = applySelections(state.candidates, state.selections)
    const selectedNew = applySelections(state.newPapers, newSelections)
    const finalPapers = [...selectedFromCandidates, ...selectedNew]

    // 全文下载（只对入选论文）+ 落库
    await this.downloadAndPersist(finalPapers, input)

    const groups = [
      ...state.groups,
      ...state.gapQueries.map((query, index) => ({ label: `gap-${index + 1}`, query })),
    ]
    const extraOverview = buildSelectorOverview(finalPapers, state, selectedFromCandidates.length)
    const cardsMd = buildResearchCards(finalPapers, state.stats, groups, extraOverview)

    this.persist('research-cards.md', cardsMd, input)
    const fullTextMd = buildFullTextMd(finalPapers)
    if (fullTextMd) this.persist('paper-fulltext.md', fullTextMd, input)
    this.persist('selector-report.md', buildSelectorReport(finalPapers, state, newSelections), input)

    return { cardsMd }
  }

  private async snowball(
    selections: SelectorSelection[],
    candidates: MergedPaper[]
  ): Promise<MergedPaper[]> {
    const client = new OpenAlexClient({
      mailto: this.config.openAlexMailto,
      timeoutMs: this.config.timeoutMs,
    })
    const selected = applySelections(candidates, selections)
    const top = [...selected]
      .sort(
        (a, b) =>
          levelRank(b.relevanceLevel) - levelRank(a.relevanceLevel) ||
          (b.citationCount ?? -1) - (a.citationCount ?? -1)
      )
      .slice(0, SNOWBALL_TOP)
      .filter((paper) => paper.source === 'openalex' && /^W\d+$/.test(paper.externalId))

    const collected: SearchPaper[] = []
    for (const paper of top) {
      try {
        const cited = await client.citedBy(paper.externalId, SNOWBALL_PER_WORK)
        collected.push(...cited)
        const refs = await client.referencesOf(paper.externalId)
        const refPapers = await client.worksByIds(refs.slice(0, SNOWBALL_REF_CAP))
        collected.push(...refPapers)
      } catch {
        // 雪球失败静默：不影响主流程
      }
    }
    return collected.map((paper) => ({ ...paper, sources: [paper.source] }))
  }

  private async downloadAndPersist(
    papers: MergedPaper[],
    input: { workflowId: string; stepId: string }
  ): Promise<void> {
    const deadline = Date.now() + this.config.downloadTimeoutMs
    await mapWithConcurrency(papers, 3, async (paper) => {
      if (Date.now() > deadline) {
        paper.downloadStatus = 'failed'
        paper.downloadError = '下载时间预算耗尽'
        return
      }
      const acquired = await acquireFullText(paper, {
        dir: path.join(process.cwd(), 'data', 'pdfs'),
        maxChars: this.config.fullTextMaxChars,
        unpaywallEmail: this.config.unpaywallEmail,
      })
      paper.fullText = acquired.result?.text ?? null
      paper.downloadStatus = acquired.result ? 'ok' : acquired.reason
      paper.downloadError =
        acquired.reason === 'failed' ? '全部候选下载失败或提取文本不足（含 Unpaywall 兜底）' : null
    })
    for (const paper of papers) {
      this.repos.papers.upsert(paper)
    }
  }

  private persist(
    name: string,
    content: string,
    input: { workflowId: string; stepId: string }
  ): void {
    const artifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name,
      content,
    })
    this.bus.emit({ type: 'artifact.updated', artifact })
  }
}

function parseCandidateBundle(content: string): CandidateBundle {
  try {
    const parsed = JSON.parse(content) as CandidateBundle
    return {
      stats: parsed.stats,
      groups: parsed.groups ?? [],
      papers: parsed.papers ?? [],
    }
  } catch {
    return { stats: emptyStats(0), groups: [], papers: [] }
  }
}

function emptyStats(gapQueries = 0): SearchStats {
  return {
    queryGroups: 0,
    sources: [],
    keywordsUsed: 0,
    queries: 0,
    minCitations: 0,
    totalHits: 0,
    uniquePapers: 0,
    failedSources: [],
    topN: 0,
    gapQueries,
  }
}

function compactPlan(planMd: string): string {
  const lines = planMd.split('\n')
  const relevant: string[] = []
  let capture = false
  for (const line of lines) {
    if (/^#{1,4}\s*(研究问题|锚定|子问题|检索关键词)/.test(line)) {
      capture = true
      relevant.push(line)
      continue
    }
    if (capture) {
      if (/^#{1,4}\s+/.test(line) && !/^(研究问题|锚定|子问题|检索关键词)/.test(line)) {
        capture = false
        continue
      }
      relevant.push(line)
    }
  }
  return relevant.join('\n').trim() || planMd.slice(0, 2000)
}

export function parseSelectorOutput(content: string): {
  selections: SelectorSelection[]
  gapQueries: string[]
} {
  const selections: SelectorSelection[] = []
  const blocks = content.split(/^###\s*\[(\d+)\]\s*/gm)
  for (let i = 1; i < blocks.length; i += 2) {
    const index = Number(blocks[i])
    const body = blocks[i + 1] ?? ''
    if (!Number.isFinite(index) || index <= 0) continue
    const judgement = body.match(/判定[：:]\s*(入选|剔除)/)
    const levelMatch = body.match(/相关度[：:]\s*(高|部分)/)
    const reasonMatch = body.match(/理由[：:]\s*(.+)/)
    const selected = judgement ? judgement[1] === '入选' : Boolean(levelMatch)
    selections.push({
      index,
      selected,
      level: selected
        ? levelMatch
          ? levelMatch[1] === '部分'
            ? 'partial'
            : 'high'
          : null
        : null,
      reason: reasonMatch?.[1]?.trim().slice(0, 200) ?? '',
    })
  }
  const gapMatch = content.match(/##\s*二次检索建议\s*([\s\S]*?)(?=\n##\s|\n#\s|$)/)
  const gapQueries: string[] = []
  if (gapMatch) {
    for (const line of gapMatch[1].split('\n')) {
      const item = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)、]\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
      if (item && !item.startsWith('#') && item.length >= 2) gapQueries.push(item)
    }
  }
  return { selections, gapQueries }
}

function applySelections(
  papers: MergedPaper[],
  selections: SelectorSelection[]
): MergedPaper[] {
  const byIndex = new Map(selections.map((selection) => [selection.index, selection]))
  const chosen: MergedPaper[] = []
  for (let index = 0; index < papers.length; index++) {
    const selection = byIndex.get(index + 1)
    if (!selection?.selected) continue
    chosen.push({
      ...papers[index],
      relevanceLevel: selection.level ?? null,
      selectionReason: selection.reason || null,
    })
  }
  return chosen.sort(
    (a, b) =>
      levelRank(b.relevanceLevel) - levelRank(a.relevanceLevel) ||
      (b.citationCount ?? -1) - (a.citationCount ?? -1)
  )
}

function levelRank(level: 'high' | 'partial' | null | undefined): number {
  if (level === 'high') return 2
  if (level === 'partial') return 1
  return 0
}

function buildSelectorOverview(
  finalPapers: MergedPaper[],
  state: SelectorStageState,
  initialSelected: number
): string[] {
  const high = finalPapers.filter((paper) => paper.relevanceLevel === 'high').length
  const partial = finalPapers.filter((paper) => paper.relevanceLevel === 'partial').length
  const lines = [
    `- 筛选：候选 ${state.candidates.length} 篇 → 入选 ${finalPapers.length} 篇（高相关 ${high} / 部分相关 ${partial}）`,
    `- 剔除：${state.candidates.length - initialSelected} 篇（详见 selector-report.md）`,
  ]
  if (state.gapQueries.length > 0) {
    lines.push(`- 二次检索：${state.gapQueries.length} 条建议查询已补检`)
  }
  const newCount = state.newPapers.length
  if (newCount > 0) {
    lines.push(`- 引文雪球 / gap 新增候选：${newCount} 篇（已重筛）`)
  }
  return lines
}

function buildSelectorReport(
  finalPapers: MergedPaper[],
  state: SelectorStageState,
  newSelections: SelectorSelection[]
): string {
  const lines = [
    '# 筛选报告（selector）',
    '',
    `- 候选池：${state.candidates.length} 篇`,
    `- 入选：${finalPapers.length} 篇（高相关 ${finalPapers.filter((p) => p.relevanceLevel === 'high').length} / 部分相关 ${finalPapers.filter((p) => p.relevanceLevel === 'partial').length}）`,
    `- 剔除：${state.candidates.length - finalPapers.length} 篇`,
    state.gapQueries.length > 0 ? `- 二次检索建议：${state.gapQueries.join('；')}` : '',
    state.newPapers.length > 0
      ? `- 雪球/gap 新增候选：${state.newPapers.length} 篇（重筛 ${
          newSelections.length > 0 ? '完成' : '未解析，回退全量入选'
        }）`
      : '',
    '',
    '## 入选清单',
    '',
    ...finalPapers.map(
      (paper, index) =>
        `- [${index + 1}] ${paper.title}（${paper.relevanceLevel === 'high' ? '高' : paper.relevanceLevel === 'partial' ? '部分' : '未分级'}）${paper.selectionReason ? `：${paper.selectionReason}` : ''}`
    ),
    '',
    '## 剔除与说明',
    '',
    '- 剔除清单见候选池与最终卡片差异；每篇入选/剔除理由已随卡片与本文档可回溯。',
  ].filter((line) => line !== '')
  return lines.join('\n')
}

function buildFullTextMd(
  papers: {
    title: string
    fullText?: string | null
    downloadStatus?: 'ok' | 'no_oa' | 'failed' | null
    downloadError?: string | null
  }[]
): string {
  const withText = papers.filter((paper) => Boolean(paper.fullText))
  const failed = papers.filter((paper) => paper.downloadStatus === 'failed')
  if (withText.length === 0) return ''
  const sections = papers
    .map((paper, index) =>
      paper.fullText ? `## [${index + 1}] ${paper.title}\n\n${paper.fullText}` : null
    )
    .filter((section): section is string => section !== null)
  const header = [
    '# 论文全文（阅读证据）',
    '',
    `- 下载：成功 ${withText.length} 篇`,
    failed.length > 0
      ? `- 失败 ${failed.length} 篇（${failed
          .map((paper) => `${paper.title.slice(0, 40)}: ${paper.downloadError ?? '未知原因'}`)
          .join('；')}）`
      : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
  return [header, ...sections].join('\n\n')
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await fn(items[index])
    }
  })
  await Promise.all(workers)
}
