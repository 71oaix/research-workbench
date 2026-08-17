import type { EvidencePoolCard } from './evidencePool'

export interface EvaluationReference {
  md: string
  themeTokens: string[]
  coreConcepts: string[]
  planOutline: string[]
  cardCount: number
  draftCitationCount: number
  draftUniqueRefs: number
  failedSourceCount: number
  failedSourceSample: string[]
}

/**
 * 为 evaluator 角色构建“规则统计参考数据”（不再生成判定结论）。
 * 输出供模型评估使用：核心概念、大纲标题、引用统计、失败源统计。
 */
export function buildEvaluationInputs(input: {
  planMd: string
  draftMd: string
  cardsMd: string
  rawCardsMd: string
  cards: EvidencePoolCard[]
}): EvaluationReference {
  const themeTokens = [...extractThemeTokens(input.planMd)]
  const coreConcepts = extractConcepts(input.planMd)
  const planOutline = extractOutline(input.planMd)
  const citationCount = countRefs(input.draftMd)
  const uniqueRefs = new Set(
    [...input.draftMd.matchAll(/\[(\d{1,4})\]/g)].map((match) => match[1])
  ).size
  const failed = failedSourceStats(input.rawCardsMd)

  const md = [
    '## 规则统计参考（仅供对账，不作判定依据）',
    '',
    `- 核心概念数：${coreConcepts.length}`,
    `- 主题词数：${themeTokens.length}`,
    `- 计划大纲章节数：${planOutline.length}`,
    `- 证据卡片数：${input.cards.length}`,
    `- 草稿引用次数：${citationCount}（去重 ${uniqueRefs}）`,
    `- 失败源数量：${failed.count}（影响查询 ${failed.queries} 个）`,
    `- 失败源示例：${failed.sample.length > 0 ? failed.sample.join('；') : '无'}`,
    '',
    '核心概念：',
    coreConcepts.length > 0
      ? coreConcepts.map((item) => `- ${item}`).join('\n')
      : '- （未从 plan 解析到）',
    '',
    '计划大纲章节：',
    planOutline.length > 0
      ? planOutline.map((item) => `- ${item}`).join('\n')
      : '- （未解析到）',
  ].join('\n')

  return {
    md,
    themeTokens,
    coreConcepts,
    planOutline,
    cardCount: input.cards.length,
    draftCitationCount: citationCount,
    draftUniqueRefs: uniqueRefs,
    failedSourceCount: failed.count,
    failedSourceSample: failed.sample,
  }
}

export function extractThemeTokens(planMd: string): Set<string> {
  const keywords = extractSection(planMd, '检索关键词')
  const source = keywords.length > 0 ? keywords : extractSection(planMd, '锚定点')
  return tokenize(source)
}

function extractConcepts(planMd: string): string[] {
  const core = extractSection(planMd, '核心概念')
  const source = core.length > 0 ? core : extractSection(planMd, '锚定点')
  const concepts: string[] = []
  for (const line of source.split('\n')) {
    const item = line
      .replace(/^[-*•]\s*/, '')
      .replace(/^#{1,4}\s*/, '')
      .replace(/\*\*/g, '')
      .trim()
    if (item.length > 1 && !/^(核心概念|方法与技术|场景|时间范围)$/.test(item)) {
      concepts.push(item)
    }
    if (concepts.length >= 20) break
  }
  return concepts
}

function extractOutline(planMd: string): string[] {
  const outline = extractSection(planMd, '综述大纲')
  return outline
    .split('\n')
    .filter((line) => !/^\s/.test(line) && /^\d+[.、]\s*/.test(line))
    .map((line) => line.replace(/^\d+[.、]\s*/, '').replace(/\*\*/g, '').trim())
    .filter((line) => line.length > 0)
}

function countRefs(md: string): number {
  return (md.match(/\[(\d{1,4})\]/g) ?? []).length
}

function failedSourceStats(
  rawCardsMd: string
): { count: number; queries: number; sample: string[] } {
  const line = rawCardsMd.split('\n').find((item) => item.includes('失败源'))
  if (!line) return { count: 0, queries: 0, sample: [] }
  const value = line.replace(/^.*失败源[：:]\s*/, '').trim()
  if (!value || value === '无') return { count: 0, queries: 0, sample: [] }
  const entries = value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    count: entries.length,
    queries: entries.length,
    sample: entries.slice(0, 5),
  }
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

export function tokenize(text: string): Set<string> {
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

export function hasIntersection(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (b.has(token)) return true
  }
  return false
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
