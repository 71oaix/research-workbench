import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArxivClient } from '../../src/search/arxiv'
import { CrossrefClient } from '../../src/search/crossref'
import { OpenAlexClient } from '../../src/search/openAlex'
import { RateLimiter } from '../../src/search/rateLimiter'
import { SemanticScholarClient } from '../../src/search/semanticScholar'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SemanticScholarClient', () => {
  it('normalizes fields and sends the API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            paperId: 'abc123',
            title: 'Attention Is All You Need',
            abstract: 'We propose a new architecture.',
            year: 2017,
            authors: [{ name: 'Ashish Vaswani' }],
            externalIds: {
              DOI: 'https://doi.org/10.48550/ARXIV.1706.03762',
              ArXiv: '1706.03762v7',
            },
            citationCount: 100000,
            url: 'https://www.semanticscholar.org/paper/abc123',
            openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762' },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new SemanticScholarClient({ apiKey: 'sk-test', retryDelayMs: () => 0 })
    const papers = await client.search('attention is all you need', 10)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/paper/search')
    expect(url).toContain('limit=10')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(papers[0]).toMatchObject({
      source: 'semantic-scholar',
      externalId: 'abc123',
      title: 'Attention Is All You Need',
      year: 2017,
      authors: ['Ashish Vaswani'],
      doi: '10.48550/arxiv.1706.03762',
      arxivId: '1706.03762',
      url: 'https://arxiv.org/pdf/1706.03762',
      citationCount: 100000,
    })
  })

  it('retries once on 429 and succeeds on the next attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('rate limited', 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new SemanticScholarClient({ retryDelayMs: () => 0 })
    await expect(client.search('query', 5)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws after retries are exhausted on persistent 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('rate limited', 429))
    vi.stubGlobal('fetch', fetchMock)

    const client = new SemanticScholarClient({ maxRetries: 1, retryDelayMs: () => 0 })
    await expect(client.search('query', 5)).rejects.toMatchObject({ status: 429 })
  })
})

describe('OpenAlexClient', () => {
  it('reconstructs abstracts, normalizes works and includes mailto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 'https://openalex.org/W123',
            doi: 'https://doi.org/10.1000/xyz',
            title: 'A Test Paper',
            publication_year: 2021,
            authorships: [
              { author: { display_name: 'Alice' } },
              { author: { display_name: 'Bob' } },
            ],
            abstract_inverted_index: { Hello: [0], world: [1] },
            cited_by_count: 42,
            primary_location: { landing_page_url: 'https://journal.example/1' },
            ids: { arxiv: 'arXiv:2101.12345' },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAlexClient({ mailto: 'me@example.com', retryDelayMs: () => 0 })
    const papers = await client.search('test', 20)

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('mailto=me%40example.com')
    expect(url).toContain('per-page=20')
    expect(papers[0]).toMatchObject({
      source: 'openalex',
      externalId: 'W123',
      title: 'A Test Paper',
      year: 2021,
      authors: ['Alice', 'Bob'],
      abstract: 'Hello world',
      doi: '10.1000/xyz',
      arxivId: '2101.12345',
      url: 'https://journal.example/1',
      citationCount: 42,
    })
  })

  it('retries on 429 with a short delay in tests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('too many', 429))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAlexClient({ retryDelayMs: () => 0 })
    await expect(client.search('query', 5)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ArxivClient', () => {
  it('parses the Atom feed and normalizes metadata', async () => {
    const xml = [
      '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">',
      '<entry>',
      '<id>http://arxiv.org/abs/1706.03762v7</id>',
      '<title>Attention Is All You Need</title>',
      '<summary>We propose a new architecture.</summary>',
      '<published>2017-06-12T00:00:00Z</published>',
      '<arxiv:doi>10.48550/arXiv.1706.03762</arxiv:doi>',
      '<author><name>Ashish Vaswani</name></author>',
      '<link rel="alternate" href="https://arxiv.org/abs/1706.03762"/>',
      '</entry>',
      '</feed>',
    ].join('')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => xml } as unknown as Response)
    )
    const client = new ArxivClient({ rateLimiter: new RateLimiter(0) })
    const papers = await client.search('attention', 5)
    expect(papers[0]).toMatchObject({
      source: 'arxiv',
      externalId: '1706.03762',
      arxivId: '1706.03762',
      title: 'Attention Is All You Need',
      year: 2017,
      authors: ['Ashish Vaswani'],
      doi: '10.48550/arxiv.1706.03762',
    })
  })

  it('lookupMany batches ids via id_list and returns a map', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const ids = new URL(url).searchParams.get('id_list')?.split(',') ?? []
      const entries = ids
        .map(
          (id) =>
            [
              '<entry>',
              `<id>http://arxiv.org/abs/${id}</id>`,
              `<title>Paper ${id}</title>`,
              `<summary>summary ${id}</summary>`,
              '<published>2024-01-01T00:00:00Z</published>',
              '<author><name>Alice</name></author>',
              '</entry>',
            ].join('')
        )
        .join('')
      return {
        ok: true,
        text: async () => `<feed>${entries}</feed>`,
      } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new ArxivClient({ rateLimiter: new RateLimiter(0) })

    const ids = Array.from({ length: 11 }, (_, index) => `2401.0000${index}`)
    const map = await client.lookupMany(ids)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl] = fetchMock.mock.calls[0] as [string]
    expect(decodeURIComponent(firstUrl)).toContain('id_list=')
    expect(decodeURIComponent(firstUrl)).toContain('2401.00000,2401.00001')
    expect(map.get('2401.00000')).toMatchObject({
      arxivId: '2401.00000',
      title: 'Paper 2401.00000',
    })
    expect(map.get('2401.000010')).toMatchObject({
      arxivId: '2401.000010',
      title: 'Paper 2401.000010',
    })
  })
})

describe('CrossrefClient', () => {
  it('normalizes works from the JSON response', async () => {
    const body = {
      message: {
        items: [
          {
            DOI: '10.1000/xyz',
            title: ['A Test Paper'],
            author: [{ given: 'Alice', family: 'Smith' }],
            issued: { 'date-parts': [[2021]] },
            'is-referenced-by-count': 42,
            URL: 'https://doi.org/10.1000/xyz',
            abstract: '<jats:p>Hello world</jats:p>',
          },
        ],
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(body),
      } as unknown as Response)
    )
    const client = new CrossrefClient({ rateLimiter: new RateLimiter(0) })
    const papers = await client.search('test', 5)
    expect(papers[0]).toMatchObject({
      source: 'crossref',
      externalId: '10.1000/xyz',
      title: 'A Test Paper',
      year: 2021,
      authors: ['Alice Smith'],
      citationCount: 42,
      abstract: 'Hello world',
    })
  })
})
