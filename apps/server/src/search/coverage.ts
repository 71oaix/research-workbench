import { hasIntersection, tokenize } from '../evidence/evaluation'
import type { MergedPaper } from './types'

export interface CoverageRow {
  id: number
  question: string
  coverage: 'covered' | 'partial' | 'missing'
  papers: number[]
  gapQuery: string
  related: { id: number; reason: string; strength: string }[]
  /** 判定依据：规则（默认）或模型复核升级。 */
  source?: 'rule' | 'model'
}

export interface CoverageResult {
  md: string
  rows: CoverageRow[]
  uncoveredQueries: string[]
}

/**
 * 覆盖判定 + 缺口驱动二次检索建议 + 相关论文路由（确定性，供 selector 后自动补检索与矩阵展示）。
 */
export function buildCoverageMatrix(planContent: string, papers: MergedPaper[]): CoverageResult {
  const questions = extractSubQuestions(planContent)
  const bilingual = extractBilingualKeywords(planContent)
  const rows: CoverageRow[] = questions.map((question, index) => {
    const qTokens = tokenize(`${question.title} ${question.body}`)
    // 双语搭桥：命中子问题的中文概念，合并对应检索关键词的英文部分，使中文子问题能匹配英文论文
    for (const pair of bilingual) {
      if (hasIntersection(qTokens, tokenize(pair.zh))) {
        for (const token of tokenize(pair.en)) qTokens.add(token)
      }
    }
    let maxOverlap = 0
    let bestPaperId = -1
    const hits: number[] = []
    papers.forEach((paper, paperIndex) => {
      const pTokens = tokenize(`${paper.title} ${paper.abstract ?? ''}`)
      const overlap = [...qTokens].filter((token) => pTokens.has(token)).length
      if (overlap > maxOverlap) {
        maxOverlap = overlap
        bestPaperId = paperIndex
      }
      if (overlap > 0) hits.push(paperIndex + 1)
    })
    const coverage = maxOverlap >= 2 ? 'covered' : maxOverlap >= 1 ? 'partial' : 'missing'
    const related = relatedRouting(question, papers, bestPaperId)
    return {
      id: index + 1,
      question: question.title,
      coverage,
      papers: hits.slice(0, 5),
      gapQuery: question.title,
      related,
    }
  })

  const uncoveredQueries = rows
    .filter((row) => row.coverage !== 'covered')
    .map((row) => row.gapQuery)
  return { md: render(rows), rows, uncoveredQueries }
}

/** 将判定行渲染为矩阵 Markdown（导出供模型复核后重建）。 */
export function renderCoverageRows(rows: CoverageRow[]): string {
  return render(rows)
}

export function extractBilingualKeywords(planMd: string): { zh: string; en: string }[] {
  const result: { zh: string; en: string }[] = []
  const lines = planMd.split('\n')
  let inKw = false
  for (const line of lines) {
    if (/^#{1,4}\s*.*检索关键词/.test(line)) {
      inKw = true
      continue
    }
    if (inKw) {
      if (/^#{1,4}\s+/.test(line)) break
      const item = line.replace(/^[-*•]\s*|\d+[.)、]\s*/, '').trim()
      if (/\/|／/.test(item)) {
        const parts = item.split(/[\/／]/)
        result.push({ zh: parts[0], en: parts[1] ?? '' })
      }
    }
  }
  return result
}

function relatedRouting(
  question: { title: string; body: string },
  papers: MergedPaper[],
  bestPaperIndex: number
): { id: number; reason: string; strength: string }[] {
  const qTokens = tokenize(`${question.title} ${question.body}`)
  const scored = papers
    .map((paper, index) => {
      const pTokens = tokenize(`${paper.title} ${paper.abstract ?? ''}`)
      const overlap = [...qTokens].filter((token) => pTokens.has(token)).length
      return { paper, index, overlap }
    })
    .filter((entry) => entry.index !== bestPaperIndex && entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2)
  return scored.map((entry) => {
    const method = entry.paper.title.includes('survey') || entry.paper.title.includes('Survey') ? '综述可迁移' : '方法相似'
    return {
      id: entry.index + 1,
      reason: entry.overlap >= 3 ? method : `场景/方法相关（交叠 ${entry.overlap} 词元）`,
      strength: entry.overlap >= 4 ? '直接支撑' : entry.overlap >= 2 ? '部分支撑' : '可迁移',
    }
  })
}

function render(rows: CoverageRow[]): string {
  const lines = [
    '# 覆盖矩阵（子问题 → 支撑论文）',
    '',
    '> 覆盖=有直接论文；部分=仅侧面/间接；缺失=无任何论文。缺失/部分会触发缺口二次检索。',
    '',
    '| 子问题 | 判定 | 支撑论文 | 缺口建议 / 相关推荐 |',
    '|--------|------|----------|------------------------|',
  ]
  for (const row of rows) {
    const sourceTag = row.source === 'model' ? '（模型复核）' : ''
    const strong = row.related
      .filter((item) => item.strength !== '可迁移')
      .map((item) => `[${item.id}] ${item.reason}（${item.strength}）`)
    const weak = row.related
      .filter((item) => item.strength === '可迁移')
      .map((item) => `[${item.id}] 可迁移`)
    const suggestion =
      row.coverage === 'missing'
        ? `缺口：${row.gapQuery}${strong.length > 0 ? '；相关推荐：无直接专论，以下最接近——' + strong.join('；') : ''}`
        : row.coverage === 'partial'
          ? `部分：${row.papers || '无'}；建议补强：${row.gapQuery}${strong.length > 0 ? '；相关：' + strong.join('；') : ''}`
          : row.papers.join('、')
    lines.push(`| ${row.id}. ${row.question}${sourceTag} | ${row.coverage} | ${row.papers.length ? row.papers.join('、') : '（无）'} | ${suggestion} |`)
  }
  return lines.join('\n')
}

function extractSubQuestions(planMd: string): { title: string; body: string }[] {
  const result: { title: string; body: string }[] = []
  const lines = planMd.split('\n')
  let inSub = false
  for (const line of lines) {
    if (/^#{1,4}\s*.*子问题/.test(line)) {
      inSub = true
      continue
    }
    if (inSub) {
      if (/^#{1,4}\s+/.test(line)) break
      const m = line.match(/^\s*\d+[.)、]\s*(.+)$/)
      if (m) {
        const item = m[1].replace(/\*\*/g, '').trim()
        const split = item.indexOf('：')
        const title = split > 0 ? item.slice(0, split) : item
        result.push({ title: title.trim(), body: item })
      }
      if (/^#/.test(line)) break
    }
  }
  if (result.length === 0) return [{ title: '整体研究问题', body: planMd.slice(0, 200) }]
  return result
}
