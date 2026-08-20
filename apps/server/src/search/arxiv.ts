import { normalizeArxiv } from './merge'
import { RateLimiter } from './rateLimiter'
import type { AcademicSearchClient, SearchFilters, SearchPaper } from './types'

export interface ArxivOptions {
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  rateLimiter?: RateLimiter
}

export class ArxivClient implements AcademicSearchClient {
  readonly source = 'arxiv'
  private readonly rateLimiter: RateLimiter

  constructor(private readonly options: ArxivOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter(3000)
  }

  async search(query: string, limit: number, _filters?: SearchFilters): Promise<SearchPaper[]> {
    const base = this.options.baseUrl ?? 'https://export.arxiv.org/api/query'
    const url = new URL(base)
    url.searchParams.set('search_query', `all:${encodeURIComponent(query)}`)
    url.searchParams.set('start', '0')
    url.searchParams.set('max_results', String(Math.min(Math.max(1, Math.floor(limit)), 100)))
    const text = await this.fetchFeed(url)
    return parseArxivFeed(text)
  }

  async lookup(id: string): Promise<SearchPaper | null> {
    const normalized = normalizeArxiv(id)
    if (!normalized) return null
    const base = this.options.baseUrl ?? 'https://export.arxiv.org/api/query'
    const url = new URL(base)
    url.searchParams.set('id_list', normalized)
    url.searchParams.set('max_results', '1')
    const text = await this.fetchFeed(url)
    return parseArxivFeed(text)[0] ?? null
  }

  /**
   * 批量核验：arXiv 支持 id_list 一次查询多个 ID（≤10/请求），
   * 把逐篇 12 次请求降到 1-2 次，显著降低 429 概率。
   */
  async lookupMany(ids: string[]): Promise<Map<string, SearchPaper | null>> {
    const result = new Map<string, SearchPaper | null>()
    const normalized: string[] = []
    for (const id of ids) {
      const key = normalizeArxiv(id)
      if (key && !normalized.includes(key)) normalized.push(key)
    }
    const base = this.options.baseUrl ?? 'https://export.arxiv.org/api/query'
    for (let i = 0; i < normalized.length; i += 10) {
      const batch = normalized.slice(i, i + 10)
      const url = new URL(base)
      url.searchParams.set('id_list', batch.join(','))
      url.searchParams.set('max_results', String(batch.length))
      const text = await this.fetchFeed(url)
      const papers = parseArxivFeed(text)
      const byId = new Map<string, SearchPaper>()
      for (const paper of papers) {
        const key = normalizeArxiv(paper.arxivId ?? paper.externalId)
        if (key) byId.set(key, paper)
      }
      for (const id of batch) result.set(id, byId.get(id) ?? null)
    }
    return result
  }

  private async fetchFeed(url: URL): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      await this.rateLimiter.acquire()
      try {
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
        })
        if (!response.ok && attempt < (this.options.maxRetries ?? 2)) {
          // 429 用更长的退避，尊重 arXiv 限流
          await sleep((response.status === 429 ? 6000 : 1000) * 2 ** attempt)
          continue
        }
        if (!response.ok) {
          throw new Error(`arxiv http ${response.status}`)
        }
        const text = await response.text()
        return text
      } catch (error) {
        if (attempt >= (this.options.maxRetries ?? 2)) {
          throw error
        }
        await sleep(1000 * 2 ** attempt)
      }
    }
  }
}

function parseArxivFeed(xml: string): SearchPaper[] {
  const entries = xml.split('<entry>').slice(1)
  const papers: SearchPaper[] = []
  entries.forEach((entry, index) => {
    const title = textOf(entry, 'title')
    const summary = textOf(entry, 'summary')
    const published = textOf(entry, 'published')
    const id = textOf(entry, 'id')
    const doi = textOf(entry, 'arxiv:doi')
    const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1].trim())
    const link = entry.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)
    const arxivId = (id.match(/(?:abs\/)?(\d{4}\.\d{4,}(?:v\d+)?)/) ?? [])[1] ?? null
    const year = (published.match(/(\d{4})/) ?? [])[1] ?? null
    if (!title) return
    papers.push({
      source: 'arxiv',
      externalId: arxivId ? (normalizeArxiv(arxivId) ?? `arxiv-${index}`) : `arxiv-${index}`,
      title,
      abstract: summary || null,
      authors,
      year: year ? Number(year) : null,
      doi: doi ? doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').toLowerCase() : null,
      arxivId: arxivId ? normalizeArxiv(arxivId) : null,
      url: link?.[1] ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
      citationCount: null,
      raw: entry,
    })
  })
  return papers
}

function textOf(entry: string, tag: string): string {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return match ? decodeXml(match[1].trim()) : ''
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
