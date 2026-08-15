import type { SearchStats } from '@research-workbench/shared'
import type { SearchConfig } from './config'
import { SearchError } from './errors'
import { expandKeywordQueries, extractKeywordGroups } from './keywords'
import { mergeAndRank } from './merge'
import { detectDomain, selectForDomain } from './sources'
import type { SourceSpec } from './sources'
import type {
  AcademicSearchClient,
  KeywordGroup,
  SearchOutput,
  SearchPaper,
} from './types'

export interface SearchOptions {
  compensate?: boolean
}

export class AcademicSearchService {
  constructor(
    private readonly specs: SourceSpec[],
    private readonly config: SearchConfig
  ) {}

  async search(planMd: string, options: SearchOptions = {}): Promise<SearchOutput> {
    const groups = extractKeywordGroups(planMd, this.config.maxGroups)
    const queries = expandKeywordQueries(groups)
    const domain = detectDomain(planMd)
    const selected = selectForDomain(this.specs, domain)
    const clients = selected.map((spec) => spec.create(this.config))
    const limit = options.compensate ? this.config.compensatePerQuery : this.config.perQuery
    const minCitations = options.compensate ? this.config.minCitations : 0

    const failed: string[] = []
    const rawPapers: SearchPaper[] = []
    const tasks = queries.flatMap((query) =>
      clients.map((client) => ({ query, client, tier: specTier(selected, client.source) }))
    )

    const settled = await Promise.allSettled(
      tasks.map(({ query, client }) => this.searchOne(client, query, limit))
    )

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        rawPapers.push(...result.value)
      } else {
        const { query, client, tier } = tasks[index]
        failed.push(`${client.source}(${tier}) ${query.query.slice(0, 24)}`)
      }
    })

    if (rawPapers.length === 0 && failed.length === tasks.length) {
      throw new SearchError(`所有检索源失败：${failed.join('、')}`)
    }

    const merged = mergeAndRank(rawPapers, this.config.topN)
    let ranked = merged.papers
    if (options.compensate && minCitations > 0) {
      const qualified = ranked.filter(
        (paper) => paper.citationCount !== null && paper.citationCount >= minCitations
      )
      if (qualified.length > 0) ranked = qualified
    }

    const stats: SearchStats = {
      queryGroups: groups.length,
      sources: selected.map((spec) =>
        spec.tier === 'T2' ? `${spec.source}(T2)` : spec.source
      ),
      keywordsUsed: queries.length,
      queries: tasks.length,
      minCitations,
      totalHits: merged.stats.totalHits,
      uniquePapers: merged.stats.uniquePapers,
      failedSources: [...new Set(failed)],
      topN: this.config.topN,
    }

    return { rawPapers, papers: ranked, stats, groups }
  }

  private async searchOne(
    client: AcademicSearchClient,
    query: KeywordGroup,
    limit: number
  ): Promise<SearchPaper[]> {
    let papers = await client.search(query.query, limit)
    if (papers.length === 0) {
      const broadened = broadenQuery(query.query)
      if (broadened !== query.query) {
        papers = await client.search(broadened, limit)
      }
    }
    return papers
  }
}

function specTier(specs: SourceSpec[], source: string): string {
  return specs.find((spec) => spec.source === source)?.tier ?? 'T1'
}

function broadenQuery(query: string): string {
  const tokens = query.split(/\s+/).filter((token) => token.length > 0)
  return tokens.length > 2 ? tokens.slice(0, 2).join(' ') : query
}
