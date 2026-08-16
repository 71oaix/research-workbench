import type { EvidencePoolCard } from './evidencePool'

const TOPIC_GATE_THRESHOLD = loadTopicGate()

export interface OutlineCoverage {
  covered: number
  total: number
}

export interface EvaluationSummary {
  assessable: boolean
  topicHitRate: number
  topicGatePassed: boolean | null
  relevanceAvg: number
  outlineCoverage: OutlineCoverage
  failedSources: string[]
}

export interface EvaluationReport {
  md: string
  summary: EvaluationSummary
}

export function buildEvaluationReport(input: {
  planMd: string
  draftMd: string
  cardsMd: string
  cards: EvidencePoolCard[]
}): EvaluationReport {
  const theme = extractThemeTokens(input.planMd)
  const assessable = theme.size > 0 && input.cards.length > 0
  const { hitRate, relevanceAvg } = assessable
    ? topicStats(theme, input.cards)
    : { hitRate: 0, relevanceAvg: 0 }
  const gatePassed = !assessable ? null : hitRate >= TOPIC_GATE_THRESHOLD
  const outline = outlineCoverage(input.planMd, input.draftMd)
  const sources = failedSources(input.cardsMd)

  const summary: EvaluationSummary = {
    assessable,
    topicHitRate: round2(hitRate),
    topicGatePassed: gatePassed,
    relevanceAvg: round2(relevanceAvg),
    outlineCoverage: outline,
    failedSources: sources,
  }

  const gateText = !assessable
    ? '无法评估（缺少主题词或卡片）'
    : gatePassed
      ? `通过（命中率 ${round2(hitRate).toFixed(2)}，门禁 ${TOPIC_GATE_THRESHOLD.toFixed(2)}）`
      : `未通过（命中率 ${round2(hitRate).toFixed(2)}，门禁 ${TOPIC_GATE_THRESHOLD.toFixed(2)}）`
  const sourceText = sources.length > 0 ? sources.join('、') : '无'
  const outlineText =
    outline.total > 0 ? `${outline.covered} / ${outline.total}` : '（大纲为空，无法覆盖）'

  const md = [
    '# 评估报告',
    '',
    '## 汇总',
    `- 主题匹配：${gateText}`,
    `- 平均相关度：${round2(relevanceAvg).toFixed(2)}`,
    `- 大纲覆盖：${outlineText}`,
    `- 来源失败：${sourceText}`,
    '',
    '## 说明',
    `- 主题词数：${theme.size}`,
    `- 卡片数：${input.cards.length}`,
    `- 门禁阈值：${TOPIC_GATE_THRESHOLD.toFixed(2)}（可配置）`,
    `- 主题词来源：plan 的“检索关键词 / 锚定点”`,
  ].join('\n')

  return { md, summary }
}

export function extractThemeTokens(planMd: string): Set<string> {
  const keywords = extractSection(planMd, '检索关键词')
  const source = keywords.length > 0 ? keywords : extractSection(planMd, '锚定点')
  return tokenize(source)
}

function topicStats(
  theme: Set<string>,
  cards: EvidencePoolCard[]
): { hitRate: number; relevanceAvg: number } {
  let hits = 0
  let relevanceSum = 0
  for (const card of cards) {
    const cardTokens = tokenize(`${card.title} ${card.abstract ?? ''}`.slice(0, 400))
    if (hasIntersection(cardTokens, theme)) hits++
    relevanceSum += jaccard(cardTokens, theme)
  }
  return { hitRate: hits / cards.length, relevanceAvg: relevanceSum / cards.length }
}

function outlineCoverage(planMd: string, draftMd: string): OutlineCoverage {
  const outline = extractSection(planMd, '综述大纲')
  const planned = outline
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim())
    .filter((line) => line.length > 0 && !/^#{1,4}\s/.test(line))
  const draftHeadings = (draftMd.match(/^#{2,3}\s+.+$/gm) ?? []).map((heading) =>
    heading.replace(/^#+\s*/, '').trim()
  )
  if (planned.length === 0) return { covered: 0, total: 0 }
  const norm = (text: string): string =>
    text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  let covered = 0
  for (const item of planned) {
    const key = norm(item)
    if (!key) continue
    if (draftHeadings.some((heading) => norm(heading).includes(key) || key.includes(norm(heading)))) {
      covered++
    }
  }
  return { covered, total: planned.length }
}

function failedSources(cardsMd: string): string[] {
  const line = cardsMd.split('\n').find((item) => item.includes('失败源'))
  if (!line) return []
  const value = line.replace(/^.*失败源[：:]\s*/, '').trim()
  if (!value || value === '无') return []
  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractSection(md: string, header: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((line) => line.includes(header))
  if (start < 0) return ''
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n')
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()
  for (const match of lower.matchAll(/[a-z0-9]+/g)) {
    const word = match[0]
    if (word.length >= 2 && !STOPWORDS.has(word)) tokens.add(word)
  }
  for (const chunk of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (chunk.length === 1) {
      tokens.add(chunk)
    } else {
      for (let i = 0; i < chunk.length - 1; i++) {
        tokens.add(chunk.slice(i, i + 2))
      }
    }
  }
  return tokens
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

function hasIntersection(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (b.has(token)) return true
  }
  return false
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function loadTopicGate(): number {
  const raw = Number(process.env.EVALUATION_TOPIC_GATE)
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.4
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'of',
  'for',
  'on',
  'to',
  'and',
  'with',
  'by',
  'et',
  'al',
  'from',
  'via',
  'over',
  'into',
])
