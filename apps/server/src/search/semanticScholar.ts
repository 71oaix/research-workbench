import { fetchJson } from './http'
import { normalizeArxiv, normalizeDoi } from './merge'
import { RateLimiter } from './rateLimiter'
import type { AcademicSearchClient, SearchPaper } from './types'

const S2_FIELDS =
  'title,abstract,year,authors,venue,externalIds,citationCount,openAccessPdf,url'

export interface SemanticScholarOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  rateLimiter?: RateLimiter
  retryDelayMs?: (attempt: number, response?: Response) => number
}

export class SemanticScholarClient implements AcademicSearchClient {
  readonly source = 'semantic-scholar'
  private readonly rateLimiter: RateLimiter

  constructor(private readonly options: SemanticScholarOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter(1000)
  }

  async search(query: string, limit: number): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://api.semanticscholar.org/graph/v1'
    const url = new URL(`${base}/paper/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('limit', String(Math.min(Math.max(1, Math.floor(limit)), 100)))
    url.searchParams.set('fields', S2_FIELDS)

    const headers: Record<string, string> = {}
    if (this.options.apiKey) {
      headers['x-api-key'] = this.options.apiKey
    }

    const data = await fetchJson(url.toString(), {
      headers,
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs:
        this.options.retryDelayMs ??
        ((attempt, response) => {
          if (response?.status === 429) return 5000
          return 1000 * 2 ** attempt
        }),
    })

    const rows = (data as { data?: unknown[] }).data ?? []
    return rows
      .map((raw, index) => normalizeS2Paper(raw, index))
      .filter((paper) => paper.title.length > 0)
  }
}

function normalizeS2Paper(raw: unknown, index: number): SearchPaper {
  const r = (raw ?? {}) as Record<string, unknown>
  const externalIds = (r.externalIds ?? {}) as Record<string, unknown>
  const authors = Array.isArray(r.authors)
    ? (r.authors as { name?: unknown }[])
        .map((author) => String(author.name ?? '').trim())
        .filter((name) => name.length > 0)
    : []
  const openAccessPdf = (r.openAccessPdf ?? null) as { url?: unknown } | null
  const url =
    typeof openAccessPdf?.url === 'string' && openAccessPdf.url
      ? openAccessPdf.url
      : typeof r.url === 'string' && r.url
        ? r.url
        : null

  return {
    source: 'semantic-scholar',
    externalId: typeof r.paperId === 'string' ? r.paperId : `s2-${index}`,
    title: String(r.title ?? '').trim(),
    abstract:
      typeof r.abstract === 'string' && r.abstract.trim() ? r.abstract : null,
    authors,
    year: typeof r.year === 'number' ? r.year : null,
    doi: normalizeDoi(externalIds.DOI ? String(externalIds.DOI) : null),
    arxivId: normalizeArxiv(externalIds.ArXiv ? String(externalIds.ArXiv) : null),
    url,
    citationCount: typeof r.citationCount === 'number' ? r.citationCount : null,
    raw: JSON.stringify(r),
  }
}
