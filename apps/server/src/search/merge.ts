import type { MergedPaper, SearchPaper } from './types'

export interface MergeStats {
  totalHits: number
  uniquePapers: number
  skippedPapers: number
}

export function mergeAndRank(
  papers: SearchPaper[],
  topN: number,
  options: { themeTokens?: Set<string>; relevanceWeight?: number } = {}
): { papers: MergedPaper[]; stats: MergeStats } {
  const filtered = filterBrokenPapers(papers)
  const merged: MergedPaper[] = []
  const index = new Map<string, MergedPaper>()
  for (const paper of filtered.papers) {
    const keys = dedupKeys(paper)
    const existing = keys.map((key) => index.get(key)).find(Boolean)
    if (!existing) {
      const record: MergedPaper = { ...paper, sources: [paper.source] }
      merged.push(record)
      for (const key of keys) index.set(key, record)
    } else {
      const updated = mergePair(existing, paper)
      Object.assign(existing, updated)
      for (const key of dedupKeys(existing)) index.set(key, existing)
    }
  }

  const clustered = clusterNearDuplicates(merged)
  const ranked = [...clustered]
    .sort((a, b) => compareWithRelevance(a, b, options))
    .slice(0, topN)
  return {
    papers: ranked,
    stats: {
      totalHits: papers.length,
      uniquePapers: clustered.length,
      skippedPapers: filtered.skipped,
    },
  }
}

/**
 * 剔除元数据损坏且无法定位权威记录的论文（无年份 && 无 DOI && 无 arXiv），
 * 避免其稀释相关度并误导 writer。
 */
function filterBrokenPapers(papers: SearchPaper[]): { papers: SearchPaper[]; skipped: number } {
  const kept: SearchPaper[] = []
  let skipped = 0
  for (const paper of papers) {
    const broken =
      paper.title.trim().length === 0 ||
      (paper.year === null &&
        !paper.abstract &&
        !paper.doi &&
        !paper.arxivId) ||
      (paper.year === null && !paper.doi && !paper.arxivId && paper.authors.length === 0) ||
      paper.authors.some((author) => author.length > 40)
    if (broken) {
      skipped++
      continue
    }
    kept.push(paper)
  }
  return { papers: kept, skipped }
}

function compareWithRelevance(
  a: MergedPaper,
  b: MergedPaper,
  options: { themeTokens?: Set<string>; relevanceWeight?: number }
): number {
  const weight = options.relevanceWeight ?? 0
  if (weight > 0 && options.themeTokens && options.themeTokens.size > 0) {
    const scoreA = relevanceScore(a, options.themeTokens, weight)
    const scoreB = relevanceScore(b, options.themeTokens, weight)
    if (scoreA !== scoreB) return scoreB - scoreA
  }
  return compare(a, b)
}

function relevanceScore(
  paper: MergedPaper,
  theme: Set<string>,
  weight: number
): number {
  const text = `${paper.title} ${paper.abstract ?? ''}`.slice(0, 400).toLowerCase()
  let hits = 0
  for (const token of theme) {
    if (text.includes(token)) hits++
  }
  return Math.log2(1 + (paper.citationCount ?? 0)) + weight * hits
}

export function normalizeDoi(doi: string | null): string | null {
  if (!doi) return null
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
}

export function normalizeArxiv(id: string | null): string | null {
  if (!id) return null
  return id.trim().toLowerCase().replace(/^arxiv:/, '').replace(/v\d+$/, '')
}

export function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function dedupKeys(paper: SearchPaper | MergedPaper): string[] {
  const keys: string[] = []
  const doi = normalizeDoi(paper.doi)
  if (doi) keys.push(`doi:${doi}`)
  const arxiv = normalizeArxiv(paper.arxivId)
  if (arxiv) keys.push(`arxiv:${arxiv}`)
  keys.push(`title:${normalizeTitle(paper.title)}`)
  return keys
}

function mergePair(a: MergedPaper, b: SearchPaper): MergedPaper {
  return {
    ...a,
    sources: [...new Set([...a.sources, b.source])],
    title: longer(a.title, b.title),
    abstract: longerOrNull(a.abstract, b.abstract),
    authors: union(a.authors, b.authors),
    year: a.year ?? b.year,
    doi: a.doi ?? b.doi,
    arxivId: a.arxivId ?? b.arxivId,
    url: preferUrl(a.url, b.url),
    citationCount: maxOrNull(a.citationCount, b.citationCount),
    raw: a.raw ?? b.raw,
  }
}

function compare(a: MergedPaper, b: MergedPaper): number {
  const citations = (b.citationCount ?? -1) - (a.citationCount ?? -1)
  if (citations !== 0) return citations
  const sources = b.sources.length - a.sources.length
  if (sources !== 0) return sources
  return (b.year ?? -1) - (a.year ?? -1)
}

function longer(a: string, b: string): string {
  return a.length >= b.length ? a : b
}

function longerOrNull(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return longer(a, b)
}

function union(a: string[], b: string[]): string[] {
  const seen = new Map<string, string>()
  for (const name of [...a, ...b]) {
    const key = name.trim().toLowerCase()
    if (key && !seen.has(key)) {
      seen.set(key, name.trim())
    }
  }
  return [...seen.values()]
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

function preferUrl(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  if (a.includes('doi.org')) return a
  if (b.includes('doi.org')) return b
  return longer(a, b)
}

function clusterNearDuplicates(list: MergedPaper[]): MergedPaper[] {
  const removed = new Set<number>()
  for (let i = 0; i < list.length; i++) {
    if (removed.has(i)) continue
    const a = list[i]
    if (a.doi || a.arxivId) continue
    for (let j = i + 1; j < list.length; j++) {
      if (removed.has(j)) continue
      const b = list[j]
      if (b.doi || b.arxivId) continue
      if (nearDuplicate(a, b)) {
        list[i] = mergePair(a, b)
        removed.add(j)
      }
    }
  }
  return list.filter((_, index) => !removed.has(index))
}

/**
 * 近重复判定：标题词元 Jaccard ≥0.75 且（首作者或年份一致）；
 * 或中文标题 bigram Jaccard ≥0.7 且（首作者或年份一致）——覆盖“同一论文中英文双标题/格式漂移”
 * 这类真实案例（如 M2-14 中 [6]/[7] 的太极统一场论论文未合并）。
 */
function nearDuplicate(a: MergedPaper, b: MergedPaper): boolean {
  const authorMatch =
    firstAuthorSurname(a.authors) !== '' &&
    firstAuthorSurname(a.authors) === firstAuthorSurname(b.authors)
  const yearMatch = a.year !== null && a.year === b.year
  if (!authorMatch && !yearMatch) return false
  if (jaccard(a.title, b.title) >= 0.75) return true
  if (chineseJaccard(a.title, b.title) >= 0.7) return true
  return false
}

function chineseJaccard(titleA: string, titleB: string): number {
  const bigrams = (title: string): Set<string> => {
    const chinese = (title.match(/[\u4e00-\u9fff]+/g) ?? []).join('')
    const set = new Set<string>()
    for (let i = 0; i < chinese.length - 1; i++) {
      set.add(chinese.slice(i, i + 2))
    }
    return set
  }
  const a = bigrams(titleA)
  const b = bigrams(titleB)
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

function firstAuthorSurname(authors: string[]): string {
  const first = authors[0]?.trim().toLowerCase()
  if (!first) return ''
  const parts = first.split(/\s+/)
  return parts[parts.length - 1] ?? first
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'of', 'for', 'on', 'to', 'and', 'with', 'by', 'et', 'al',
])

function jaccard(titleA: string, titleB: string): number {
  const tokens = (title: string): Set<string> => {
    const set = new Set<string>()
    for (const token of title.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token && !STOPWORDS.has(token)) set.add(token)
    }
    return set
  }
  const a = tokens(titleA)
  const b = tokens(titleB)
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}
