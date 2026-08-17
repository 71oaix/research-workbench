import { describe, expect, it, vi } from 'vitest'
import { acquireFullText, fullTextKey, resolvePdfUrls } from '../../src/evidence/fullText'
import type { MergedPaper } from '../../src/search/types'

function paper(partial: Partial<MergedPaper>): MergedPaper {
  return {
    source: 'arxiv',
    externalId: 'x',
    title: 'Paper',
    abstract: null,
    authors: [],
    year: null,
    doi: null,
    arxivId: null,
    url: null,
    citationCount: null,
    raw: null,
    sources: ['arxiv'],
    ...partial,
  }
}

function okResponse(body: string): Response {
  const bytes = Buffer.from(body)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return {
    ok: true,
    arrayBuffer: async () => copy.buffer,
  } as unknown as Response
}

const longText = async () => 'mocked paper text '.repeat(200)

describe('fullText', () => {
  it('resolves pdf urls from arxiv id, s2 open access, and openalex best_oa_location', () => {
    expect(resolvePdfUrls(paper({ arxivId: '1706.03762' }))).toEqual([
      'https://arxiv.org/pdf/1706.03762',
    ])
    expect(
      resolvePdfUrls(paper({ raw: JSON.stringify({ openAccessPdf: { url: 'https://x/paper.pdf' } }) }))
    ).toEqual(['https://x/paper.pdf'])
    expect(
      resolvePdfUrls(paper({ raw: JSON.stringify({ best_oa_location: { pdf_url: 'https://x/oa.pdf' } }) }))
    ).toEqual(['https://x/oa.pdf'])
  })

  it('deduplicates repeated candidates', () => {
    const urls = resolvePdfUrls(
      paper({
        arxivId: '1706.03762',
        url: 'https://arxiv.org/pdf/1706.03762',
        raw: JSON.stringify({
          openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762' },
          best_oa_location: { pdf_url: 'https://x/oa.pdf' },
        }),
      })
    )
    expect(urls).toEqual(['https://arxiv.org/pdf/1706.03762', 'https://x/oa.pdf'])
  })

  it('normalizes the full-text key by doi, arxiv, then title', () => {
    expect(fullTextKey(paper({ doi: 'https://doi.org/10.1000/a' }))).toBe('doi:10.1000/a')
    expect(fullTextKey(paper({ arxivId: '2401.12345v2' }))).toBe('arxiv:2401.12345')
    expect(fullTextKey(paper({ title: 'Attention Is All You Need' }))).toContain('attentionisallyouneed')
  })

  it('returns no_oa when there are no candidates', async () => {
    const result = await acquireFullText(paper({}), { dir: 'data/pdfs-test', maxChars: 1000 })
    expect(result).toEqual({ result: null, reason: 'no_oa' })
  })

  it('fails with failed when the downloaded file is not a PDF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('not a pdf')))
    const result = await acquireFullText(paper({ arxivId: '1706.03762' }), {
      dir: 'data/pdfs-test',
      maxChars: 1000,
    })
    expect(result).toEqual({ result: null, reason: 'failed' })
  })

  it('fails with failed when the fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await acquireFullText(paper({ arxivId: '1706.03762' }), {
      dir: 'data/pdfs-test',
      maxChars: 1000,
    })
    expect(result).toEqual({ result: null, reason: 'failed' })
  })

  it('fails with failed when extraction yields fewer than 500 chars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('%PDF-1.4\nfake')))
    const result = await acquireFullText(paper({ arxivId: '1706.03762' }), {
      dir: 'data/pdfs-test',
      maxChars: 1000,
      extractText: async () => 'short',
    })
    expect(result).toEqual({ result: null, reason: 'failed' })
  })

  it('falls back to the next candidate when the first one fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('not a pdf'))
      .mockResolvedValueOnce(okResponse('%PDF-1.4\nvalid header'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await acquireFullText(
      paper({
        arxivId: '1706.03762',
        raw: JSON.stringify({ openAccessPdf: { url: 'https://x/paper.pdf' } }),
      }),
      { dir: 'data/pdfs-test', maxChars: 1000, extractText: longText }
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result?.reason).toBe('ok')
    expect(result?.result?.source).toBe('oa')
    expect(result?.result?.url).toBe('https://x/paper.pdf')
  })

  it('does not attempt further candidates once one succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('%PDF-1.4\nvalid header'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await acquireFullText(paper({ arxivId: '1706.03762' }), {
      dir: 'data/pdfs-test',
      maxChars: 1000,
      extractText: longText,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result?.reason).toBe('ok')
    expect(result?.result?.source).toBe('arxiv')
  })
})
