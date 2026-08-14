import { fetchJson } from './http'
import { normalizeArxiv, normalizeDoi } from './merge'
import { RateLimiter } from './rateLimiter'
import type { AcademicSearchClient, SearchPaper } from './types'

const OPENALEX_SELECT =
  'id,doi,title,publication_year,authorships,abstract_inverted_index,cited_by_count,primary_location,ids'

export interface OpenAlexOptions {
  mailto?: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  rateLimiter?: RateLimiter
  retryDelayMs?: (attempt: number, response?: Response) => number
}

export class OpenAlexClient implements AcademicSearchClient {
  readonly source = 'openalex'
  private readonly rateLimiter: RateLimiter

  constructor(private readonly options: OpenAlexOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter(100)
  }

  async search(query: string, limit: number): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://api.openalex.org'
    const url = new URL(`${base}/works`)
    url.searchParams.set('search', query)
    url.searchParams.set('per-page', String(Math.min(Math.max(1, Math.floor(limit)), 200)))
    url.searchParams.set('select', OPENALEX_SELECT)
    if (this.options.mailto) {
      url.searchParams.set('mailto', this.options.mailto)
    }

    const data = await fetchJson(url.toString(), {
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs:
        this.options.retryDelayMs ??
        ((attempt, response) => {
          if (response?.status === 429) return 1000
          return 1000 * 2 ** attempt
        }),
    })

    const rows = (data as { results?: unknown[] }).results ?? []
    return rows
      .map((raw, index) => normalizeOpenAlexWork(raw, index))
      .filter((paper) => paper.title.length > 0)
  }
}

function normalizeOpenAlexWork(raw: unknown, index: number): SearchPaper {
  const r = (raw ?? {}) as Record<string, unknown>
  const ids = (r.ids ?? {}) as Record<string, unknown>
  const doi = normalizeDoi(typeof r.doi === 'string' ? r.doi : null)
  const arxivRaw =
    typeof ids.arxiv === 'string'
      ? ids.arxiv
      : typeof ids.ArXiv === 'string'
        ? ids.ArXiv
        : null
  const authors = Array.isArray(r.authorships)
    ? (r.authorships as { author?: { display_name?: unknown } }[])
        .map((a) => String(a.author?.display_name ?? '').trim())
        .filter((name) => name.length > 0)
    : []
  const primaryLocation = (r.primary_location ?? null) as {
    landing_page_url?: unknown
  } | null
  const landingUrl =
    typeof primaryLocation?.landing_page_url === 'string'
      ? primaryLocation.landing_page_url
      : null
  const workId = typeof r.id === 'string' ? r.id.replace('https://openalex.org/', '') : null

  return {
    source: 'openalex',
    externalId: workId ?? `oa-${index}`,
    title: String(r.title ?? '').trim(),
    abstract: reconstructAbstract(
      (r.abstract_inverted_index ?? null) as Record<string, number[]> | null
    ),
    authors,
    year: typeof r.publication_year === 'number' ? r.publication_year : null,
    doi,
    arxivId: normalizeArxiv(arxivRaw),
    url: landingUrl ?? (doi ? `https://doi.org/${doi}` : null),
    citationCount: typeof r.cited_by_count === 'number' ? r.cited_by_count : null,
    raw: JSON.stringify(r),
  }
}

function reconstructAbstract(
  index: Record<string, number[]> | null
): string | null {
  if (!index) return null
  const positions: { position: number; word: string }[] = []
  for (const [word, positionList] of Object.entries(index)) {
    for (const position of positionList) {
      positions.push({ position, word })
    }
  }
  positions.sort((a, b) => a.position - b.position)
  const abstract = positions.map((p) => p.word).join(' ').trim()
  return abstract.length > 0 ? abstract : null
}
