import { describe, expect, it } from 'vitest'
import { mergeAndRank } from '../../src/search/merge'
import type { SearchPaper } from '../../src/search/types'

function paper(partial: Partial<SearchPaper> & { title: string }): SearchPaper {
  const base: SearchPaper = {
    source: 'semantic-scholar',
    externalId: `id-${partial.title}`,
    title: partial.title,
    abstract: null,
    authors: [],
    year: null,
    doi: null,
    arxivId: null,
    url: null,
    citationCount: null,
    raw: null,
  }
  return { ...base, ...partial }
}

describe('mergeAndRank', () => {
  it('merges cross-source duplicates by DOI and keeps the richest fields', () => {
    const fromS2 = paper({
      title: 'Paper A',
      doi: '10.1000/a',
      abstract: 'short',
      authors: ['Alice'],
      citationCount: 10,
      url: 'https://s2.example/a',
      source: 'semantic-scholar',
    })
    const fromOpenAlex = paper({
      title: 'Paper A (longer title)',
      doi: 'https://doi.org/10.1000/a',
      abstract: 'this is a much longer abstract',
      authors: ['Bob'],
      citationCount: 100,
      url: 'https://journal.example/doi/10.1000/a',
      source: 'openalex',
    })

    const { papers, stats } = mergeAndRank([fromS2, fromOpenAlex], 15)
    expect(papers).toHaveLength(1)
    expect(stats).toEqual({ totalHits: 2, uniquePapers: 1, skippedPapers: 0 })
    expect(papers[0].citationCount).toBe(100)
    expect(papers[0].abstract).toBe('this is a much longer abstract')
    expect(papers[0].authors).toEqual(['Alice', 'Bob'])
    expect(papers[0].sources).toEqual(['semantic-scholar', 'openalex'])
    expect(papers[0].doi).toBe('10.1000/a')
    expect(papers[0].title).toBe('Paper A (longer title)')
  })

  it('merges arXiv ids ignoring version suffixes', () => {
    const v2 = paper({ title: 'T', arxivId: '2401.12345v2', source: 'semantic-scholar' })
    const v1 = paper({ title: 'T', arxivId: '2401.12345', source: 'openalex' })
    const { papers } = mergeAndRank([v2, v1], 15)
    expect(papers).toHaveLength(1)
    expect(papers[0].sources).toEqual(['semantic-scholar', 'openalex'])
  })

  it('merges by normalized title when no identifiers exist', () => {
    const a = paper({
      title: 'Attention Is All You Need!',
      source: 'semantic-scholar',
      authors: ['Alice'],
      abstract: 'abstract a',
    })
    const b = paper({
      title: 'attention is all you need',
      source: 'openalex',
      authors: ['Bob'],
      abstract: 'abstract b',
    })
    const { papers } = mergeAndRank([a, b], 15)
    expect(papers).toHaveLength(1)
  })

  it('merges version records that share a title even when DOIs differ', () => {
    const versionA = paper({
      title: 'The PRISMA 2020 statement: an updated guideline for reporting systematic reviews',
      doi: '10.1136/bmj.n71',
      citationCount: 100900,
      source: 'openalex',
      authors: ['Matthew Page', 'Cindy Mulrow'],
    })
    const versionB = paper({
      title: 'The PRISMA 2020 statement: An updated guideline for reporting systematic reviews',
      doi: '10.1016/j.ijsu.2021.105906',
      citationCount: 11741,
      source: 'openalex',
    })
    const versionC = paper({
      title: 'The PRISMA 2020 statement: an updated guideline for reporting systematic reviews',
      doi: '10.31222/osf.io/v7gm2',
      citationCount: 5348,
      source: 'openalex',
      authors: ['cindy mulrow'],
    })
    const { papers, stats } = mergeAndRank([versionA, versionB, versionC], 15)
    expect(stats.uniquePapers).toBe(1)
    expect(papers[0].doi).toBe('10.1136/bmj.n71')
    expect(papers[0].citationCount).toBe(100900)
    expect(papers[0].sources).toEqual(['openalex'])
    expect(papers[0].authors).toEqual(['Matthew Page', 'Cindy Mulrow'])
  })

  it('ranks by citations, then source count, then year, and applies topN', () => {
    const papers = [
      paper({ title: 'Low', citationCount: 5, year: 2024, source: 'openalex' }),
      paper({ title: 'High', citationCount: 100, year: 2020, source: 'semantic-scholar' }),
      paper({
        title: 'Medium',
        citationCount: 50,
        year: 2019,
        source: 'semantic-scholar',
        doi: '10.1/medium',
      }),
      paper({
        title: 'Medium',
        citationCount: 50,
        year: 2019,
        source: 'openalex',
        doi: '10.1/medium',
      }),
      paper({ title: 'Medium single', citationCount: 50, year: 2022, source: 'openalex' }),
    ]
    const { papers: ranked } = mergeAndRank(papers, 3)
    expect(ranked.map((p) => p.title)).toEqual([
      'High',
      'Medium',
      'Medium single',
    ])
  })

  it('merges near-title duplicates by first author and Jaccard similarity', () => {
    const versionA = paper({
      title: 'An updated guideline for reporting systematic reviews',
      authors: ['Matthew Page'],
      source: 'crossref',
      abstract: 'guideline abstract',
    })
    const versionB = paper({
      title: 'Updated guideline for reporting systematic reviews',
      authors: ['M. Page'],
      source: 'openalex',
      abstract: 'guideline abstract',
    })
    const { papers } = mergeAndRank([versionA, versionB], 15)
    expect(papers).toHaveLength(1)
    expect(papers[0].authors).toEqual(['Matthew Page', 'M. Page'])
  })

  it('filters broken metadata papers and reports skipped count', () => {
    const broken = paper({
      title: 'Multi-agent UAV anti-jamming',
      source: 'semantic-scholar',
      authors: [
        '吴志娟',
        '未知的动态环境和日趋复杂的作战任务需求促使无人机系统向着集群化自主化和智能化方向发展的一个非常长的异常作者字段内容用于触发元数据过滤',
      ],
    })
    const ok = paper({
      title: 'Normal Paper',
      source: 'semantic-scholar',
      authors: ['Alice'],
      year: 2024,
    })
    const { papers, stats } = mergeAndRank([broken, ok], 15)
    expect(papers).toHaveLength(1)
    expect(papers[0].title).toBe('Normal Paper')
    expect(stats.skippedPapers).toBe(1)
  })

  it('filters papers without year, abstract and identifiers even with authors', () => {
    const unverifiable = paper({
      title: 'Multi-Agent Systems Meet LLM: Future Directions',
      source: 'semantic-scholar',
      authors: ['Qimeng Li'],
      url: 'https://x',
      citationCount: 3,
    })
    const ok = paper({
      title: 'Normal Paper',
      source: 'semantic-scholar',
      authors: ['Alice'],
      year: 2024,
      abstract: 'abstract',
    })
    const { papers, stats } = mergeAndRank([unverifiable, ok], 15)
    expect(papers).toHaveLength(1)
    expect(papers[0].title).toBe('Normal Paper')
    expect(stats.skippedPapers).toBe(1)
  })
})
