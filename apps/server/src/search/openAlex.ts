import { fetchJson } from './http'
import { normalizeArxiv, normalizeDoi } from './merge'
import { RateLimiter } from './rateLimiter'
import type { AcademicSearchClient, SearchFilters, SearchPaper } from './types'

const OPENALEX_SELECT =
  'id,doi,title,publication_year,authorships,abstract_inverted_index,cited_by_count,primary_location,best_oa_location,ids'

export interface OpenAlexOptions {
  mailto?: string
  apiKey?: string
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
    if (!options.apiKey) {
      console.warn(
        '[openalex] 未配置 OPENALEX_API_KEY：OpenAlex 2026-02 起要求 key，无 key 仅限试用额度，可能被限流（申请：https://openalex.org/users/me）'
      )
    }
  }

  private applyAuth(url: URL): void {
    if (this.options.apiKey) url.searchParams.set('api_key', this.options.apiKey)
  }

  async search(query: string, limit: number, filters?: SearchFilters): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://api.openalex.org'
    const url = new URL(`${base}/works`)
    url.searchParams.set('search', query)
    url.searchParams.set('per-page', String(Math.min(Math.max(1, Math.floor(limit)), 200)))
    url.searchParams.set('select', OPENALEX_SELECT)
    const oaFilter = buildOpenAlexDateFilter(filters)
    if (oaFilter) url.searchParams.set('filter', oaFilter)
    if (this.options.mailto) {
      url.searchParams.set('mailto', this.options.mailto)
    }
    this.applyAuth(url)

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

  /**
   * 引文雪球：返回引用指定工作（cites:W{id}）的论文，用于“被引方向”扩展候选池。
   */
  async citedBy(workId: string, limit: number): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://api.openalex.org'
    const url = new URL(`${base}/works`)
    url.searchParams.set('filter', `cites:${workId}`)
    url.searchParams.set('per-page', String(Math.min(Math.max(1, Math.floor(limit)), 100)))
    url.searchParams.set('select', OPENALEX_SELECT)
    if (this.options.mailto) url.searchParams.set('mailto', this.options.mailto)
    this.applyAuth(url)
    const data = await fetchJson(url.toString(), {
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs: this.options.retryDelayMs,
    })
    const rows = (data as { results?: unknown[] }).results ?? []
    return rows
      .map((raw, index) => normalizeOpenAlexWork(raw, index))
      .filter((paper) => paper.title.length > 0)
  }

  /**
   * 按 OpenAlex 工作 ID 批量取记录（用于“参考文献方向”雪球）。
   * 返回 null 表示该 ID 未解析到标题（可能被删除或不是 work）。
   */
  async worksByIds(ids: string[]): Promise<SearchPaper[]> {
    if (ids.length === 0) return []
    const unique = [...new Set(ids)].filter((id) => /^W\d+$/.test(id))
    if (unique.length === 0) return []
    const base = this.options.baseUrl ?? 'https://api.openalex.org'
    const url = new URL(`${base}/works`)
    url.searchParams.set('filter', `openalex:${unique.slice(0, 50).join('|')}`)
    url.searchParams.set('per-page', String(Math.min(unique.length, 50)))
    url.searchParams.set('select', OPENALEX_SELECT)
    if (this.options.mailto) url.searchParams.set('mailto', this.options.mailto)
    this.applyAuth(url)
    const data = await fetchJson(url.toString(), {
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs: this.options.retryDelayMs,
    })
    const rows = (data as { results?: unknown[] }).results ?? []
    return rows
      .map((raw, index) => normalizeOpenAlexWork(raw, index))
      .filter((paper) => paper.title.length > 0)
  }

  /**
   * 返回指定工作的参考文献 ID 列表（W 开头）。调用方再用 worksByIds 批量取记录。
   */
  async referencesOf(workId: string): Promise<string[]> {
    const base = this.options.baseUrl ?? 'https://api.openalex.org'
    const url = new URL(`${base}/works/${encodeURIComponent(workId)}`)
    url.searchParams.set('select', 'referenced_works')
    if (this.options.mailto) url.searchParams.set('mailto', this.options.mailto)
    this.applyAuth(url)
    const data = await fetchJson(url.toString(), {
      timeoutMs: this.options.timeoutMs ?? 30_000,
      maxRetries: this.options.maxRetries ?? 3,
      rateLimiter: this.rateLimiter,
      retryDelayMs: this.options.retryDelayMs,
    })
    const refs = (data as { referenced_works?: unknown }).referenced_works
    return Array.isArray(refs)
      ? (refs as unknown[]).map((id) => String(id).replace('https://openalex.org/', ''))
      : []
  }
}

function buildOpenAlexDateFilter(filters?: SearchFilters): string | null {
  const parts: string[] = []
  if (filters?.yearFrom) parts.push(`from_publication_date:${filters.yearFrom}-01-01`)
  if (filters?.yearTo) parts.push(`to_publication_date:${filters.yearTo}-12-31`)
  return parts.length > 0 ? parts.join(',') : null
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
