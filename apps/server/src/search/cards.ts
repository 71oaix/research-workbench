import type { KeywordGroup, MergedPaper, SearchStats } from './types'

export function buildResearchCards(
  papers: MergedPaper[],
  stats: SearchStats,
  groups: KeywordGroup[]
): string {
  const lines: string[] = [
    '# 检索证据卡片（确定性管道）',
    '',
    '## 检索概览',
    `- 检索关键词：${groups.map((g) => g.query).join('；')}`,
    `- 数据源：${stats.sources.join('、')}`,
    `- 命中 / 去重：${stats.totalHits} / ${stats.uniquePapers}（取前 ${stats.topN}）`,
    `- 失败源：${stats.failedSources.length > 0 ? stats.failedSources.join('、') : '无'}`,
    '',
    '## 论文卡片',
    '',
  ]

  if (papers.length === 0) {
    lines.push('（未检索到论文）')
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
    }
    lines.push('')
  })

  return lines.join('\n')
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
