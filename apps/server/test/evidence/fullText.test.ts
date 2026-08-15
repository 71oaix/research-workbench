import { describe, expect, it, vi } from 'vitest'
import { acquireFullText, fullTextKey, resolvePdfUrl } from '../../src/evidence/fullText'
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

describe('fullText', () => {
  it('resolves pdf url from arxiv id, s2 open access, and openalex best_oa_location', () => {
    expect(resolvePdfUrl(paper({ arxivId: '1706.03762' }))).toBe(
      'https://arxiv.org/pdf/1706.03762'
    )
    expect(
      resolvePdfUrl(
        paper({ raw: JSON.stringify({ openAccessPdf: { url: 'https://x/paper.pdf' } }) })
      )
    ).toBe('https://x/paper.pdf')
    expect(
      resolvePdfUrl(
        paper({ raw: JSON.stringify({ best_oa_location: { pdf_url: 'https://x/oa.pdf' } }) })
      )
    ).toBe('https://x/oa.pdf')
  })

  it('normalizes the full-text key by doi, arxiv, then title', () => {
    expect(fullTextKey(paper({ doi: 'https://doi.org/10.1000/a' }))).toBe('doi:10.1000/a')
    expect(fullTextKey(paper({ arxivId: '2401.12345v2' }))).toBe('arxiv:2401.12345')
    expect(fullTextKey(paper({ title: 'Attention Is All You Need' }))).toContain('attentionisallyouneed')
  })

  it('returns null when the downloaded file is not a PDF', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('not a pdf').buffer,
      } as unknown as Response)
    )
    const result = await acquireFullText(
      paper({ arxivId: '1706.03762' }),
      { dir: 'data/pdfs-test', maxChars: 1000 }
    )
    expect(result).toBeNull()
  })

  it('returns null when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await acquireFullText(
      paper({ arxivId: '1706.03762' }),
      { dir: 'data/pdfs-test', maxChars: 1000 }
    )
    expect(result).toBeNull()
  })
})
