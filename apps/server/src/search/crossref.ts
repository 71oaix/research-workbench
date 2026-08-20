import { fetchJson, SearchHttpError } from './http'
import { normalizeDoi } from './merge'
import { RateLimiter } from './rateLimiter'
import type { AcademicSearchClient, SearchFilters, SearchPaper } from './types'

export interface CrossrefOptions {
  mailto?: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  rateLimiter?: RateLimiter
}

export class CrossrefClient implements AcademicSearchClient {
  readonly source = 'crossref'
  private readonly rateLimiter: RateLimiter

  constructor(private readonly options: CrossrefOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter(20)
  }

  async search(query: string, limit: number, _filters?: SearchFilters): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://api.crossref.org'
    const url = new URL(`${base}/works`)
    url.searchParams.set('query', query)
    url.searchParams.set('rows', String(Math.min(Math.max(1, Math.floor(limit)), 100)))
    url.searchParams.set('select', 'DOI,title,author,issued,is-referenced-by-count,abstract,URL')
    if (this.options.mailto) {
      url.searchParams.set('mailto', this.options.mailto)
    }

    const data = await fetchJson(url.toString(), {
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs: (attempt) => 1000 * 2 ** attempt,
    })

    const items = (data as { message?: { items?: unknown[] } }).message?.items ?? []
    return items
      .map((raw, index) => normalizeCrossrefWork(raw, index))
      .filter((paper) => paper.title.length > 0 && !isCrossrefNoise(paper.title, paper.raw))
  }

  async lookup(doi: string): Promise<SearchPaper | null> {
    const normalized = normalizeDoi(doi)
    if (!normalized) return null
    const base = this.options.baseUrl ?? 'https://api.crossref.org'
    const url = new URL(`${base}/works/${encodeURIComponent(normalized)}`)
    if (this.options.mailto) {
      url.searchParams.set('mailto', this.options.mailto)
    }

    try {
      const data = await fetchJson(url.toString(), {
        timeoutMs: this.options.timeoutMs ?? 30_000,
        maxRetries: this.options.maxRetries ?? 3,
        rateLimiter: this.rateLimiter,
        retryDelayMs: (attempt) => 1000 * 2 ** attempt,
      })
      const message = (data as { message?: unknown }).message
      if (!message) return null
      const paper = normalizeCrossrefWork(message, 0)
      return paper.title.length > 0 ? paper : null
    } catch (error) {
      if (error instanceof SearchHttpError && error.status === 404) {
        return null
      }
      throw error
    }
  }
}

/**
 * 过滤 Crossref 收录的图表/补充材料条目（图注、表注等被当作独立 work 收录，
 * 元数据完整但并非论文）。type=component 直接过滤；其余要求"标题前缀 + 强结构信号"
 * 同时成立，避免误杀 "Table-based…"、"Figure Ground…" 等合法论文标题。
 */
function isCrossrefNoise(title: string, rawJson: string | null): boolean {
  let type: string | null = null
  if (rawJson) {
    try {
      const raw = JSON.parse(rawJson) as { type?: unknown }
      type = typeof raw.type === 'string' ? raw.type : null
    } catch {
      type = null
    }
  }
  if (type === 'component') return true
  const prefix =
    /^(table|figure|fig\.?|supplementary( material| file| information)?|supporting information)\b/i
  const strongSignal = /\d\s*[:.]|file\s+\d+/i
  return prefix.test(title) && strongSignal.test(title)
}

function normalizeCrossrefWork(raw: unknown, index: number): SearchPaper {
  const r = (raw ?? {}) as Record<string, unknown>
  const title = Array.isArray(r.title) ? String(r.title[0] ?? '').trim() : ''
  const authors = Array.isArray(r.author)
    ? (r.author as { given?: unknown; family?: unknown }[])
        .map((a) => `${String(a.given ?? '').trim()} ${String(a.family ?? '').trim()}`.trim())
        .filter((name) => name.length > 0)
    : []
  const issued = (r.issued ?? {}) as { 'date-parts'?: unknown }
  const dateParts = Array.isArray(issued['date-parts'])
    ? (issued['date-parts'] as unknown[][])[0]
    : null
  const year = dateParts && typeof dateParts[0] === 'number' ? Number(dateParts[0]) : null
  const doi = normalizeDoi(typeof r.DOI === 'string' ? r.DOI : null)

  return {
    source: 'crossref',
    externalId: doi ?? `crossref-${index}`,
    title,
    abstract: stripXml(String(r.abstract ?? '')) || null,
    authors,
    year,
    doi,
    arxivId: null,
    url: typeof r.URL === 'string' ? r.URL : null,
    citationCount: typeof r['is-referenced-by-count'] === 'number' ? Number(r['is-referenced-by-count']) : null,
    raw: JSON.stringify(r),
  }
}

function stripXml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
