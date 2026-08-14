import type { MergedPaper, SearchPaper } from './types'

export interface MergeStats {
  totalHits: number
  uniquePapers: number
}

export function mergeAndRank(
  papers: SearchPaper[],
  topN: number
): { papers: MergedPaper[]; stats: MergeStats } {
  const merged: MergedPaper[] = []
  const index = new Map<string, MergedPaper>()
  for (const paper of papers) {
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

  const ranked = [...merged].sort(compare).slice(0, topN)
  return {
    papers: ranked,
    stats: { totalHits: papers.length, uniquePapers: merged.length },
  }
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
