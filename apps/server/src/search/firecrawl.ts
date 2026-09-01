/**
 * Firecrawl 网页搜索 / 抓取客户端（v2 API）。
 *
 * 用途：selector 证据补位——学术文献覆盖稀疏的工程实践类子问题，不再只依赖
 * 硬编码官方文档白名单；当白名单未命中或抓取不足时，用真实 web 搜索兜底，
 * 命中任意权威网页（官方文档 / 博客 / 教程 / 仓库 README）作为 writer 参考素材。
 *
 * 预算纪律：Firecrawl 免费层 ~1000 credits/月，v2 search 每次约 1 credit、
 * scrape 每次约 1-5 credits。因此：
 *  - 每行至多 1 次 search（limit 4），description 足够长就直接用作摘要，不 scrape；
 *  - 仅当 description 过短（<600 字符）才对 top-1 做 1 次 scrape 取完整内容；
 *  - 任何失败（无 key / 网络 / 4xx / 5xx）都向上抛，由调用方静默降级，不阻塞主流程。
 */
export interface FirecrawlSearchHit {
  url: string
  title: string
  description?: string
  position?: number
  category?: string
}

export interface FirecrawlClientOptions {
  apiKey: string
  timeoutMs?: number
  maxRetries?: number
}

export class FirecrawlError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2'
const MAX_SCRAPE_EXCERPT_CHARS = 2000

export class FirecrawlClient {
  private readonly baseUrl = FIRECRAWL_BASE
  private readonly timeoutMs: number
  private readonly maxRetries: number

  constructor(private readonly opts: FirecrawlClientOptions) {
    if (!opts.apiKey || !opts.apiKey.trim()) {
      throw new FirecrawlError(0, 'missing_firecrawl_api_key')
    }
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.maxRetries = opts.maxRetries ?? 1
  }

  /** 网页搜索：query → 命中列表（title/url/description 摘要）。 */
  async search(
    query: string,
    options: { limit?: number; lang?: string } = {}
  ): Promise<FirecrawlSearchHit[]> {
    const { limit = 4, lang } = options
    const body: Record<string, unknown> = { query, limit }
    if (lang) body.lang = lang
    const json = (await this.post('/search', body)) as {
      data?: { web?: FirecrawlSearchHit[] }
    }
    return json?.data?.web ?? []
  }

  /** 单页抓取：url → markdown；失败返回 null（不抛，交给上层判断摘要质量）。 */
  async scrape(url: string): Promise<string | null> {
    try {
      const json = (await this.post('/scrape', {
        url,
        formats: ['markdown'],
      })) as { data?: { markdown?: string } }
      const md = json?.data?.markdown
      return typeof md === 'string' && md.trim() ? md.slice(0, MAX_SCRAPE_EXCERPT_CHARS) : null
    } catch {
      return null
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        if (res.ok) return await res.json()
        const text = await res.text().catch(() => '')
        if (attempt < this.maxRetries && (res.status === 429 || res.status >= 500)) {
          await sleep(800 * (attempt + 1))
          continue
        }
        throw new FirecrawlError(res.status, text.slice(0, 200) || `firecrawl_http_${res.status}`)
      } catch (e) {
        lastError = e
        if (attempt < this.maxRetries) {
          await sleep(800 * (attempt + 1))
          continue
        }
      }
    }
    throw lastError instanceof Error ? lastError : new FirecrawlError(0, String(lastError))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
