import { SearchError } from './errors'
import type { KeywordGroup } from './types'

interface PlanSection {
  title: string
  items: string[]
}

export interface TimeRange {
  yearFrom?: number
  yearTo?: number
}

export function extractKeywordGroups(planMd: string, maxGroups = 10): KeywordGroup[] {
  const sections = splitSections(planMd)
  const keywordsSection = sections.find((s) => /检索\s*关键词|搜索关键词|关键词/.test(s.title))
  const subQuestionsSection = sections.find((s) => /子问题/.test(s.title))
  // RefChain：子问题即子查询。关键词组优先保留，子问题组作为补充，
  // 两组去重合并后统一截断到 maxGroups，避免查询数失控。
  const items = [
    ...(keywordsSection?.items ?? []),
    ...(subQuestionsSection?.items ?? []),
  ]

  const cleaned = items.map(cleanItem).filter((q): q is string => q.length > 0)
  const groups = dedupe(cleaned).slice(0, maxGroups)
  if (groups.length === 0) {
    throw new SearchError(
      '01-plan.md 中未找到“检索关键词”或“子问题”小节，无法生成检索查询'
    )
  }
  return groups.map((query, index) => ({ label: `g${index + 1}`, query }))
}

export function expandKeywordQueries(groups: KeywordGroup[]): KeywordGroup[] {
  const expanded: KeywordGroup[] = []
  for (const group of groups) {
    const parts = group.query
      .split(/[/；;]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    if (parts.length <= 1) {
      expanded.push(group)
    } else {
      parts.forEach((part, index) => {
        expanded.push({ label: `${group.label}-${index + 1}`, query: part })
      })
    }
    // 同义词/缩写扩展（确定性映射，免费稳定）：每组至多 +2 条，控制成本
    const synonyms = expandSynonyms(group.query)
    synonyms.slice(0, 2).forEach((synonym, index) => {
      if (!expanded.some((item) => item.query === synonym)) {
        expanded.push({ label: `${group.label}-syn${index + 1}`, query: synonym })
      }
    })
  }
  return expanded
}

/**
 * 缩写 → 全称的确定性扩展映射。命中缩写（词边界、忽略大小写）时
 * 追加“全称”作为独立查询，扩大召回面。
 */
const SYNONYM_MAP: Record<string, string> = {
  LLM: 'large language model',
  RAG: 'retrieval augmented generation',
  RL: 'reinforcement learning',
  RLHF: 'reinforcement learning from human feedback',
  NLP: 'natural language processing',
  CV: 'computer vision',
  MLLM: 'multimodal large language model',
  VLM: 'vision language model',
  GNN: 'graph neural network',
  CNN: 'convolutional neural network',
  GAN: 'generative adversarial network',
  SFT: 'supervised fine tuning',
  AGI: 'artificial general intelligence',
  AI: 'artificial intelligence',
}

export function expandSynonyms(query: string): string[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/)
  const hits: string[] = []
  for (const [abbr, full] of Object.entries(SYNONYM_MAP)) {
    if (tokens.includes(abbr.toLowerCase()) && !query.toLowerCase().includes(full)) {
      hits.push(full)
    }
  }
  return hits
}

/**
 * 从 plan 中解析时间范围（锚定点/时间范围小节）：
 * - 明确年份区间：2020-2025、2018–2023、2019 至 2024
 * - 近 N 年 / 最近 N 年：yearFrom = 当前年份 - N
 * - 单年起点：2020 年（以来/至今/以后）
 * 解析失败返回 null（调用方不加过滤，安全网）。
 */
export function parseTimeRange(planMd: string, nowYear = new Date().getFullYear()): TimeRange | null {
  const text = planMd.replace(/\s+/g, ' ')
  const range = text.match(
    /(?:19|20)\d{2}\s*[-–—至到]\s*(?:19|20)\d{2}/
  )
  if (range) {
    const [a, b] = range[0].split(/[-–—至到]/).map((part) => Number(part.match(/\d{4}/)?.[0]))
    if (a && b) {
      return { yearFrom: Math.min(a, b), yearTo: Math.max(a, b) }
    }
  }
  const recent = text.match(/(?:近|最近)\s*(\d{1,2})\s*年/)
  if (recent) {
    const n = Number(recent[1])
    if (Number.isFinite(n) && n > 0) {
      return { yearFrom: nowYear - n }
    }
  }
  const since = text.match(/(?:19|20)\d{2}\s*年?\s*(?:以来|至今|以后|之后|至今为止)/)
  if (since) {
    const year = Number(since[0].match(/\d{4}/)?.[0])
    if (year) return { yearFrom: year }
  }
  const single = text.match(/(?:19|20)\d{2}\s*年/)
  if (single) {
    const year = Number(single[0].match(/\d{4}/)?.[0])
    if (year) return { yearFrom: year }
  }
  return null
}

/**
 * arxiv 查询适配：无英文内容的查询跳过；>4 实词查询精简到前 3 个实词，
 * 缓解 arxiv all: 长短语 AND 召回过低的问题。
 */
export function normalizeArxivQuery(query: string): string | null {
  const trimmed = query.trim()
  if (!/[a-zA-Z0-9]/.test(trimmed)) return null
  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !ARXIV_STOPWORDS.has(token))
  if (tokens.length <= 4) return trimmed
  return tokens.slice(0, 3).join(' ')
}

const ARXIV_STOPWORDS = new Set([
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

function splitSections(md: string): PlanSection[] {
  const sections: PlanSection[] = []
  let current: PlanSection | null = null
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim()
    if (/^#{1,3}\s+/.test(line)) {
      current = { title: line.replace(/^#{1,3}\s+/, ''), items: [] }
      sections.push(current)
      continue
    }
    if (!current) continue
    if (/^[-*]\s+/.test(line) || /^\d+[.)、]\s*/.test(line)) {
      current.items.push(line)
    }
  }
  return sections
}

function cleanItem(raw: string): string {
  return raw
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[*`]/g, '')
    .trim()
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)]
}
