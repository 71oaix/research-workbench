import type { KeywordGroup, MergedPaper, SearchStats } from './types'

export function extractCardIds(cardsMd: string): number[] {
  const ids: number[] = []
  const pattern = /^###\s*\[(\d{1,4})\]/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cardsMd))) {
    ids.push(Number(match[1]))
  }
  return ids
}

export function buildResearchCards(
  papers: MergedPaper[],
  stats: SearchStats,
  groups: KeywordGroup[],
  extraOverview: string[] = []
): string {
  const fullTextCount = papers.filter((paper) => Boolean(paper.fullText)).length
  const failedCount = papers.filter((paper) => paper.downloadStatus === 'failed').length
  const noOaCount = papers.filter((paper) => paper.downloadStatus === 'no_oa').length
  const lines: string[] = [
    '# 检索证据卡片（确定性管道）',
    '',
    '## 检索概览',
    `- 检索关键词：${groups.map((group) => group.query).join('；')}`,
    `- 数据源：${stats.sources.join('、')}`,
    `- 命中 / 去重：${stats.totalHits} / ${stats.uniquePapers}（取前 ${stats.topN}）`,
    `- 关键词组 / 查询数：${stats.keywordsUsed} / ${stats.queries}`,
    stats.minCitations > 0 ? `- 引用数下限：${stats.minCitations}` : '',
    `- 全文：已读 ${fullTextCount} / 失败 ${failedCount} / 无开放获取 ${noOaCount} / 仅摘要 ${
      papers.length - fullTextCount
    }`,
    ...extraOverview,
    stats.skippedPapers ? `- 过滤损坏元数据：${stats.skippedPapers} 篇` : '',
    `- 失败源：${stats.failedSources.length > 0 ? stats.failedSources.join('、') : '无'}`,
    '',
    '## 论文卡片',
    '',
  ].filter((line) => line !== '')

  if (papers.length === 0) {
    lines.push('（未检索到论文）')
    return lines.join('\n')
  }

  papers.forEach((paper, index) => {
    const meta: string[] = [
      paper.year ? `年份：${paper.year}` : '年份：未知',
      `引用数：${paper.citationCount ?? 0}`,
      `来源：${paper.sources.join('+')}`,
      downloadLabel(paper),
    ]
    if (paper.relevanceLevel === 'high' || paper.relevanceLevel === 'partial') {
      meta.push(`相关度：${paper.relevanceLevel === 'high' ? '高' : '部分'}`)
    }
    if (paper.doi) meta.push(`DOI：${paper.doi}`)
    if (paper.arxivId) meta.push(`arXiv：${paper.arxivId}`)
    if (paper.url) meta.push(`链接：${paper.url}`)

    lines.push(
      `### [${index + 1}] ${paper.title}`,
      `- ${meta.join(' | ')}`,
      `- 作者：${paper.authors.length > 0 ? paper.authors.join(', ') : '未知'}`,
    )
    if (paper.abstract) {
      lines.push(`- 摘要：${truncate(paper.abstract, 300)}`)
    } else {
      lines.push('- 摘要：缺失（该卡片无摘要，仅可引用标题层面信息）')
    }
    if (paper.selectionReason) {
      lines.push(`- 筛选理由：${paper.selectionReason}`)
    }
    lines.push('')
  })

  return lines.join('\n')
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 检索候选池卡片：researcher 阶段的确定性产物（只含标题+摘要，不下载全文），
 * 供 selector 批量筛选。编号即候选索引。
 */
export function buildResearchCandidates(
  papers: MergedPaper[],
  stats: SearchStats,
  groups: KeywordGroup[]
): string {
  const lines: string[] = [
    '# 检索候选池（确定性管道，未筛选）',
    '',
    '## 检索概览',
    `- 检索关键词：${groups.map((group) => group.query).join('；')}`,
    `- 数据源：${stats.sources.join('、')}`,
    `- 命中 / 去重：${stats.totalHits} / ${stats.uniquePapers}（候选 ${papers.length} 篇）`,
    `- 关键词组 / 查询数：${stats.keywordsUsed} / ${stats.queries}`,
    stats.gapQueries && stats.gapQueries > 0
      ? `- 二次检索查询：${stats.gapQueries}`
      : '',
    stats.skippedPapers ? `- 过滤损坏元数据：${stats.skippedPapers} 篇` : '',
    `- 失败源：${stats.failedSources.length > 0 ? stats.failedSources.join('、') : '无'}`,
    '',
    '## 候选论文',
    '',
  ].filter((line) => line !== '')

  if (papers.length === 0) {
    lines.push('（未检索到候选论文）')
    return lines.join('\n')
  }

  papers.forEach((paper, index) => {
    const meta: string[] = [
      paper.year ? `年份：${paper.year}` : '年份：未知',
      `引用数：${paper.citationCount ?? 0}`,
      `来源：${paper.sources.join('+')}`,
    ]
    if (paper.doi) meta.push(`DOI：${paper.doi}`)
    if (paper.arxivId) meta.push(`arXiv：${paper.arxivId}`)
    if (paper.url) meta.push(`链接：${paper.url}`)

    lines.push(
      `### [${index + 1}] ${paper.title}`,
      `- ${meta.join(' | ')}`,
      `- 作者：${paper.authors.length > 0 ? paper.authors.join(', ') : '未知'}`,
    )
    if (paper.abstract) {
      lines.push(`- 摘要：${truncate(paper.abstract, 300)}`)
    } else {
      lines.push('- 摘要：缺失')
    }
    lines.push('')
  })

  return lines.join('\n')
}

function downloadLabel(paper: {
  fullText?: string | null
  downloadStatus?: 'ok' | 'no_oa' | 'failed' | null
  downloadError?: string | null
}): string {
  if (paper.downloadStatus === 'failed') {
    return `全文：下载失败（${paper.downloadError ?? '未知原因'}）`
  }
  if (paper.downloadStatus === 'no_oa') return '全文：无开放获取'
  return paper.fullText ? '全文：已读' : '全文：仅摘要'
}
