import { describe, expect, it } from 'vitest'
import { AcademicSearchService } from '../../src/search/AcademicSearchService'
import { loadSearchConfig } from '../../src/search/config'
import type { Domain, SourceSpec } from '../../src/search/sources'
import type { AcademicSearchClient, SearchPaper } from '../../src/search/types'

function makePaper(source: string, title: string, citationCount: number): SearchPaper {
  return {
    source,
    externalId: `${source}-${title}`,
    title,
    abstract: null,
    authors: ['Author One'],
    year: 2024,
    doi: null,
    arxivId: null,
    url: null,
    citationCount,
    raw: null,
  }
}

function fakeSpec(
  source: string,
  results: (query: string) => SearchPaper[],
  record?: { queries: string[]; limits: number[] }
): SourceSpec {
  const client: AcademicSearchClient = {
    source,
    async search(query, limit) {
      record?.queries.push(query)
      record?.limits.push(limit)
      return results(query)
    },
  }
  return {
    source,
    tier: 'T1',
    domains: ['cs', 'cross-disciplinary', 'exhaustive', 'medical'] as Domain[],
    create: () => client,
  }
}

describe('AcademicSearchService', () => {
  it('expands bilingual keywords and reports query stats', async () => {
    const record = { queries: [] as string[], limits: [] as number[] }
    const spec = fakeSpec(
      'mock',
      (query) => (query.includes('memory') ? [makePaper('mock', 'Memory Paper', 5)] : []),
      record
    )
    const service = new AcademicSearchService([spec], loadSearchConfig({}))
    const plan = '## 检索关键词\n- 多智能体 记忆架构 / multi-agent memory architecture'

    const output = await service.search(plan)

    expect(output.stats.queryGroups).toBe(1)
    expect(output.stats.keywordsUsed).toBe(2)
    expect(output.stats.queries).toBe(2)
    expect(record.queries).toContain('multi-agent memory architecture')
  })

  it('uses the higher per-query limit in compensate mode', async () => {
    const record = { queries: [] as string[], limits: [] as number[] }
    const spec = fakeSpec(
      'mock',
      () => [makePaper('mock', 'Paper', 5)],
      record
    )
    const config = loadSearchConfig({ SEARCH_COMPENSATE_PER_QUERY: '50' })
    const service = new AcademicSearchService([spec], config)
    const plan = '## 检索关键词\n- memory'

    await service.search(plan)
    expect(record.limits).toContain(25)

    record.limits = []
    await service.search(plan, { compensate: true })
    expect(record.limits).toContain(50)
  })

  it('applies the citation floor in compensate mode', async () => {
    const spec = fakeSpec('mock', () => [
      makePaper('mock', 'High Impact', 100),
      makePaper('mock', 'Low Impact', 2),
    ])
    const config = loadSearchConfig({ SEARCH_MIN_CITATIONS: '10' })
    const service = new AcademicSearchService([spec], config)
    const plan = '## 检索关键词\n- memory'

    const output = await service.search(plan, { compensate: true })

    expect(output.papers.map((paper) => paper.title)).toEqual(['High Impact'])
    expect(output.stats.minCitations).toBe(10)
  })

  it('broadens a query once when it returns no results', async () => {
    const record = { queries: [] as string[], limits: [] as number[] }
    const spec = fakeSpec(
      'mock',
      (query) => (query === 'memory architecture' ? [makePaper('mock', 'Found', 5)] : []),
      record
    )
    const service = new AcademicSearchService([spec], loadSearchConfig({}))
    const plan = '## 检索关键词\n- memory architecture llm agent'

    const output = await service.search(plan)

    expect(record.queries).toContain('memory architecture llm agent')
    expect(record.queries).toContain('memory architecture')
    expect(output.rawPapers.map((paper) => paper.title)).toContain('Found')
  })

  it('limits per-source concurrency to the configured bound', async () => {
    let active = 0
    let maxActive = 0
    const client: AcademicSearchClient = {
      source: 'mock',
      async search() {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 30))
        active--
        return []
      },
    }
    const spec: SourceSpec = {
      source: 'mock',
      tier: 'T1',
      domains: ['cs', 'cross-disciplinary', 'exhaustive', 'medical'] as Domain[],
      create: () => client,
    }
    const config = loadSearchConfig({ SEARCH_SOURCE_CONCURRENCY: '2' })
    const service = new AcademicSearchService([spec], config)
    const plan = [
      '## 检索关键词',
      '- g1',
      '- g2',
      '- g3',
      '- g4',
      '- g5',
      '- g6',
      '- g7',
      '- g8',
    ].join('\n')

    await service.search(plan)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('trips the circuit after repeated source failures and reports source-level stats', async () => {
    let searchCalls = 0
    const client: AcademicSearchClient = {
      source: 'mock',
      async search() {
        searchCalls++
        throw new Error('http 429')
      },
    }
    const spec: SourceSpec = {
      source: 'mock',
      tier: 'T2',
      domains: ['cs', 'cross-disciplinary', 'exhaustive', 'medical'] as Domain[],
      create: () => client,
    }
    const config = loadSearchConfig({ SEARCH_SOURCE_CONCURRENCY: '1' })
    const service = new AcademicSearchService([spec], config)
    const plan = [
      '## 检索关键词',
      '- g1',
      '- g2',
      '- g3',
      '- g4',
      '- g5',
      '- g6',
      '- g7',
      '- g8',
    ].join('\n')

    await expect(service.search(plan)).rejects.toThrow(/熔断/)
    expect(searchCalls).toBe(3)
  })

  it('trims long arxiv queries and skips pure-chinese queries', async () => {
    const record = { queries: [] as string[] }
    const client: AcademicSearchClient = {
      source: 'arxiv',
      async search(query) {
        record.queries.push(query)
        return [makePaper('arxiv', `Found ${query}`, 1)]
      },
    }
    const spec: SourceSpec = {
      source: 'arxiv',
      tier: 'T1',
      domains: ['cs', 'cross-disciplinary', 'exhaustive', 'medical'] as Domain[],
      create: () => client,
    }
    const service = new AcademicSearchService([spec], loadSearchConfig({}))
    const plan = [
      '## 检索关键词',
      '- episodic semantic memory LLM agent',
      '- 多智能体 记忆架构',
    ].join('\n')

    await service.search(plan)

    expect(record.queries).toContain('episodic semantic memory')
    expect(record.queries.some((query) => /[\u4e00-\u9fff]/.test(query))).toBe(false)
  })
})
