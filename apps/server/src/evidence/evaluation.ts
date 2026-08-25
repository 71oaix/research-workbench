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

export interface SixDimScore {
  dim: string
  score: number | null
  note: string
}

export interface SixDimResult {
  md: string
  dims: SixDimScore[]
}

/**
 * 确定性"六维完整评分"（0-5）：主题匹配 / 相关度 / 大纲覆盖 / 引用可信 / 来源失败 / 完整性。
 * 用规则统计计算，可横向比较、可测试；供 evaluator 参考与前端展示，不作为唯一判定。
 */
export function computeSixDimScores(input: {
  cards: EvidencePoolCard[]
  cardsMd: string
  themeTokens: string[]
  planOutline: string[]
  draftMd: string
  failedSourceCount: number
  draftUniqueRefs: number
}): SixDimResult {
  const cards = input.cards
  const total = Math.max(1, cards.length)

  // 1 主题匹配：命中主题词的卡片占比
  const themeHit = cards.filter((card) => {
    const tokens = tokenize(`${card.title} ${card.abstract}`)
    return input.themeTokens.some((token) => tokens.has(token))
  }).length
  const themeScore = roundScore((themeHit / total) * 5)

  // 2 相关度：高/部分分级加权
  const high = countLevel(input.cardsMd, '相关度：高')
  const partial = countLevel(input.cardsMd, '相关度：部分')
  const relevanceScore = roundScore(
    (high * 5 + partial * 3) / Math.max(1, high + partial)
  )

  // 3 大纲覆盖：计划章节被草稿提及的比例（按章节标题词元与草稿交集）
  const outlined = input.planOutline.length
  const noDraft = input.draftMd.trim().length === 0
  const corpusTokens = tokenize(input.draftMd)
  const cardCorpus = tokenize(
    input.cards.map((card) => `${card.title} ${card.abstract}`).join(' ')
  )
  const covered = input.planOutline.filter((chapter) => {
    const chapterTokens = tokenize(chapter)
    return noDraft
      ? hasIntersection(chapterTokens, cardCorpus)
      : hasIntersection(chapterTokens, corpusTokens)
  }).length
  const outlineScore = outlined === 0 ? 3 : roundScore((covered / outlined) * 5)

  // 4 引用可信：无草稿时用"卡片可识别（含 DOI/arXiv）"口径，有草稿时用草稿去重引用覆盖
  const identifiable = input.cards.filter((card) => card.doi || card.arxivId).length
  const trustScore = noDraft
    ? roundScore(Math.min(5, (identifiable / total) * 5))
    : roundScore(Math.min(5, (input.draftUniqueRefs / total) * 5))

  // 5 来源失败：失败源越少越高
  const sourceScore = input.failedSourceCount === 0
    ? 5
    : Math.max(1, 5 - input.failedSourceCount)

  // 6 完整性：计划外未覆盖的章节越少越高
  const uncovered = Math.max(0, outlined - covered)
  const completenessScore = Math.max(0, 5 - uncovered)

  const dims: SixDimScore[] = [
    { dim: '主题匹配', score: themeScore, note: `${themeHit}/${total} 张卡片命中主题词` },
    { dim: '相关度', score: relevanceScore, note: `高 ${high} / 部分 ${partial}` },
    { dim: '大纲覆盖', score: outlineScore, note: noDraft ? `证据池覆盖 ${covered}/${outlined} 个计划章节` : `覆盖 ${covered}/${outlined} 个计划章节` },
    { dim: '引用可信', score: trustScore, note: noDraft ? `可识别卡片 ${identifiable}/${total}` : `草稿去重引用 ${input.draftUniqueRefs} / ${total} 张卡片` },
    { dim: '来源失败', score: sourceScore, note: `失败源 ${input.failedSourceCount} 个` },
    { dim: '完整性', score: completenessScore, note: `未覆盖章节 ${Math.max(0, outlined - covered)}` },
  ]
  const totalScore = roundScore(dims.reduce((sum, item) => sum + (item.score ?? 0), 0) / 5)
  dims.push({ dim: '综合', score: totalScore, note: '六维平均（0-5）' })

  const md = [
    '## 六维完整评分（规则口径，0-5）',
    '',
    '| 维度 | 评分 | 说明 |',
    '|------|------|------|',
    ...dims.map((item) => `| ${item.dim} | ${item.score ?? '—'} | ${item.note} |`),
  ].join('\n')
  return { md, dims }
}

function countLevel(md: string, label: string): number {
  const re = new RegExp(label.replace(/[：:]/g, '[：:]'), 'g')
  return (md.match(re) ?? []).length
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
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
