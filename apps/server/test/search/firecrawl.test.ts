import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirecrawlClient, FirecrawlError } from '../../src/search/firecrawl'
import { fetchWebDocs, mergeDocRefs } from '../../src/search/officialDocs'
import type { CoverageRow } from '../../src/search/coverage'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init)))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FirecrawlClient', () => {
  it('search parses web hits from v2 response', async () => {
    stubFetch(() =>
      jsonResponse({
        success: true,
        data: {
          web: [
            { url: 'https://docs.mem0.ai/', title: 'Mem0 Docs', description: 'memory layer…', position: 1 },
            { url: 'https://github.com/mem0ai/mem0', title: 'GitHub', description: 'repo…', position: 2, category: 'github' },
          ],
        },
      })
    )
    const client = new FirecrawlClient({ apiKey: 'fc-test' })
    const hits = await client.search('Mem0 memory', { limit: 2 })
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({ url: 'https://docs.mem0.ai/', title: 'Mem0 Docs' })
  })

  it('search throws FirecrawlError on non-ok status', async () => {
    stubFetch(() => jsonResponse({ error: 'quota' }, false, 429))
    const client = new FirecrawlClient({ apiKey: 'fc-test', maxRetries: 0 })
    await expect(client.search('x')).rejects.toBeInstanceOf(FirecrawlError)
  })

  it('scrape returns markdown and nulls on failure', async () => {
    stubFetch((_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (body.url === 'https://example.com/a') {
        return jsonResponse({ success: true, data: { markdown: '# Title\n\nbody text' } })
      }
      return jsonResponse({ error: 'x' }, false, 500)
    })
    const client = new FirecrawlClient({ apiKey: 'fc-test', maxRetries: 0 })
    await expect(client.scrape('https://example.com/a')).resolves.toContain('# Title')
    await expect(client.scrape('https://example.com/fail')).resolves.toBeNull()
  })

  it('constructor rejects empty api key', () => {
    expect(() => new FirecrawlClient({ apiKey: '  ' })).toThrow(FirecrawlError)
  })
})

describe('fetchWebDocs', () => {
  const rows: CoverageRow[] = [
    {
      id: 1,
      question: '多智能体记忆架构的设计原则',
      coverage: 'missing',
      papers: [],
      gapQuery: '多智能体记忆架构的设计原则',
      related: [],
    },
    {
      id: 2,
      question: 'Mem0 memory layer',
      coverage: 'partial',
      papers: [1],
      gapQuery: 'Mem0 memory layer',
      related: [],
    },
    {
      id: 3,
      question: '已覆盖问题',
      coverage: 'covered',
      papers: [2],
      gapQuery: '已覆盖问题',
      related: [],
    },
  ]

  it('returns empty when no api key (whitelist-only fallback)', async () => {
    const stub = vi.fn()
    vi.stubGlobal('fetch', stub)
    const docs = await fetchWebDocs(rows, { timeoutMs: 1000 })
    expect(docs.size).toBe(0)
    expect(stub).not.toHaveBeenCalled()
  })

  it('searches uncovered rows, skips covered, and uses description as excerpt', async () => {
    stubFetch(() =>
      jsonResponse({
        success: true,
        data: {
          web: [
            {
              url: 'https://docs.agile-agents.io/memory',
              title: 'Memory Architecture',
              description: 'x'.repeat(800),
              position: 1,
            },
          ],
        },
      })
    )
    const docs = await fetchWebDocs(rows, { timeoutMs: 1000, apiKey: 'fc-test', planContent: '' })
    // covered row 3 skipped
    expect(docs.has(3)).toBe(false)
    // rows 1,2 got refs from web hits
    expect(docs.size).toBe(2)
    const refs = docs.get(1) ?? []
    expect(refs.length).toBeGreaterThan(0)
    expect(refs[0].url).toBe('https://docs.agile-agents.io/memory')
    expect(refs[0].site).toContain('docs.agile-agents.io')
  })

  it('falls back to scrape when description too short', async () => {
    stubFetch((url) => {
      if ((url as string).endsWith('/search')) {
        return jsonResponse({
          success: true,
          data: { web: [{ url: 'https://example.com/mem', title: 'M', description: 'short' }] },
        })
      }
      if ((url as string).endsWith('/scrape')) {
        return jsonResponse({ success: true, data: { markdown: 'long body '.repeat(200) } })
      }
      return jsonResponse({ error: 'x' }, false, 500)
    })
    const docs = await fetchWebDocs([rows[0]], { timeoutMs: 1000, apiKey: 'fc-test' })
    const refs = docs.get(1) ?? []
    expect(refs[0].excerpt.length).toBeGreaterThan(1000)
  })
})

describe('mergeDocRefs', () => {
  it('dedupes by url with whitelist priority', () => {
    const whitelist = new Map([[1, [{ title: 'W', url: 'https://a.com/x', site: 'whitelist', excerpt: 'w' }]]])
    const web = new Map([
      [
        1,
        [
          { title: 'W', url: 'https://a.com/x', site: 'web', excerpt: 'w' },
          { title: 'B', url: 'https://b.com/y', site: 'web', excerpt: 'b' },
        ],
      ],
    ])
    const merged = mergeDocRefs(whitelist, web)
    const refs = merged.get(1) ?? []
    expect(refs).toHaveLength(2)
    expect(refs[0].site).toBe('whitelist')
  })
})
