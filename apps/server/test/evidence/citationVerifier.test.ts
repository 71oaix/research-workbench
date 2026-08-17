import { describe, expect, it } from 'vitest'
import { createVerifierDeps, verifyCitations } from '../../src/evidence/citationVerifier'
import type { CitationVerifierDeps } from '../../src/evidence/citationVerifier'
import type { EvidencePoolCard } from '../../src/evidence/evidencePool'
import type { CrossrefClient } from '../../src/search/crossref'
import type { SemanticScholarClient } from '../../src/search/semanticScholar'
import type { SearchPaper } from '../../src/search/types'

function card(overrides: Partial<EvidencePoolCard> = {}): EvidencePoolCard {
  return {
    key: overrides.doi ? `doi:${overrides.doi}` : `title:${overrides.title ?? 'paper'}`,
    title: overrides.title ?? 'Attention Is All You Need',
    doi: overrides.doi ?? null,
    arxivId: overrides.arxivId ?? null,
    url: overrides.url ?? null,
    citationCount: overrides.citationCount ?? 0,
    authors: overrides.authors ?? 'Ashish Vaswani, Noam Shazeer',
    year: overrides.year ?? 2017,
    abstract: overrides.abstract ?? '',
    versions: overrides.versions ?? [1],
  }
}

function paper(overrides: Partial<SearchPaper> = {}): SearchPaper {
  return {
    source: overrides.source ?? 'crossref',
    externalId: overrides.doi ?? 'x',
    title: overrides.title ?? 'Attention Is All You Need',
    abstract: overrides.abstract ?? null,
    authors: overrides.authors ?? ['Ashish Vaswani', 'Noam Shazeer'],
    year: overrides.year ?? 2017,
    doi: overrides.doi ?? '10.1000/a',
    arxivId: overrides.arxivId ?? null,
    url: overrides.url ?? null,
    citationCount: overrides.citationCount ?? null,
    raw: overrides.raw ?? null,
  }
}

function deps(overrides: Partial<CitationVerifierDeps> = {}): CitationVerifierDeps {
  return {
    lookupDoi: async () => null,
    searchByTitleAuthor: async () => null,
    lookupArxiv: async () => null,
    ...overrides,
  }
}

describe('verifyCitations', () => {
  it('marks a DOI that resolves to a different paper as needs_fix', async () => {
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [card({ doi: '10.1000/a', title: 'Attention Is All You Need' })],
      deps: deps({
        lookupDoi: async () =>
          paper({ title: 'BERT: Pre-training of Deep Bidirectional Transformers', year: 2018, authors: ['Jacob Devlin'] }),
      }),
    })

    expect(report.items).toHaveLength(1)
    expect(report.items[0].status).toBe('needs_fix')
    expect(report.items[0].level).toBe('critical')
  })

  it('flags year and first-author mismatch as check_suggested', async () => {
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [card({ doi: '10.1000/a', authors: 'Ashish Vaswani', year: 2017 })],
      deps: deps({
        lookupDoi: async () => paper({ authors: ['Noam Shazeer'], year: 2019 }),
      }),
    })

    expect(report.items[0].status).toBe('check_suggested')
    expect(report.items[0].level).toBe('warning')
    expect(report.items[0].issues.join('；')).toContain('年份不一致')
    expect(report.items[0].issues.join('；')).toContain('第一作者不一致')
  })

  it('marks an unresolvable DOI as unverifiable', async () => {
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [card({ doi: '10.1000/missing' })],
      deps: deps({ lookupDoi: async () => null, searchByTitleAuthor: async () => null }),
    })

    expect(report.items[0].status).toBe('unverifiable')
    expect(report.items[0].level).toBe('info')
  })

  it('falls back to title+author search when the card has no DOI', async () => {
    let searched = false
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [card({ doi: null, title: 'Attention Is All You Need', authors: 'Ashish Vaswani' })],
      deps: deps({
        lookupDoi: async () => null,
        searchByTitleAuthor: async () => {
          searched = true
          return paper()
        },
      }),
    })

    expect(searched).toBe(true)
    expect(report.items[0].status).toBe('verified')
    expect(report.items[0].resolvedVia).toBe('search')
  })

  it('verifies a matching paper resolved by DOI', async () => {
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [card({ doi: '10.1000/a' })],
      deps: deps({ lookupDoi: async () => paper() }),
    })

    expect(report.items[0].status).toBe('verified')
    expect(report.items[0].level).toBe('info')
    expect(report.items[0].resolvedVia).toBe('doi')
    expect(report.md).toContain('引用核验报告')
  })

  it('flags an out-of-range citation id as needs_fix', async () => {
    const report = await verifyCitations({
      draft: 'see [3]',
      cards: [card()],
      deps: deps(),
    })

    expect(report.items[0].status).toBe('needs_fix')
    expect(report.items[0].level).toBe('critical')
    expect(report.items[0].issues.join('；')).toContain('超出证据池范围')
  })

  it('uses arxiv lookup for arxiv papers instead of crossref', async () => {
    const report = await verifyCitations({
      draft: 'see [1]',
      cards: [
        card({
          doi: '10.48550/arxiv.2310.02172',
          arxivId: '2310.02172',
          title: 'Lyfe Agents: Generative agents for low-cost real-time social interactions',
          authors: 'Zhao Kaiya',
          year: 2023,
        }),
      ],
      deps: deps({
        lookupArxiv: async () =>
          paper({
            title: 'Lyfe Agents: Generative agents for low-cost real-time social interactions',
            authors: ['Zhao Kaiya'],
            year: 2023,
          }),
      }),
    })

    expect(report.items[0].status).toBe('verified')
    expect(report.items[0].resolvedVia).toBe('arxiv')
  })

  it('falls back to Semantic Scholar when Crossref search finds nothing', async () => {
    const crossref = {
      search: async () => [],
      lookup: async () => null,
    }
    const semanticScholar = {
      search: async () => [paper({ source: 'semantic-scholar', doi: '10.1000/s2', title: 'S2 Result' })],
    }
    const deps = createVerifierDeps({
      crossref: crossref as unknown as CrossrefClient,
      semanticScholar: semanticScholar as unknown as SemanticScholarClient,
    })

    const resolved = await deps.searchByTitleAuthor('S2 Result', 'Author')
    expect(resolved?.source).toBe('semantic-scholar')
  })

  it('caches DOI lookups across calls', async () => {
    let lookupCalls = 0
    const crossref = {
      search: async () => [],
      lookup: async () => {
        lookupCalls++
        return paper()
      },
    }
    const deps = createVerifierDeps({
      crossref: crossref as unknown as CrossrefClient,
    })

    const first = await deps.lookupDoi('10.1000/a')
    const second = await deps.lookupDoi('https://doi.org/10.1000/A')

    expect(first?.doi).toBe('10.1000/a')
    expect(second?.doi).toBe('10.1000/a')
    expect(lookupCalls).toBe(1)
  })
})
