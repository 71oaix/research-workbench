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
      .filter((paper) => paper.title.length > 0)
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
