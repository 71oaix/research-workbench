import type { SearchStats } from '@research-workbench/shared'
import { extractThemeTokens } from '../evidence/evaluation'
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

    const settled = await runPerSourceConcurrent(tasks, this.config.sourceConcurrency, (task) =>
      this.searchOne(task.client, task.query, limit)
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

    const theme = extractThemeTokens(planMd)
    const merged = mergeAndRank(rawPapers, this.config.topN, {
      themeTokens: theme.size > 0 ? theme : undefined,
      relevanceWeight: this.config.relevanceWeight,
    })
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
      skippedPapers: merged.stats.skippedPapers,
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

/**
 * 按数据源分组并发执行：同一源的请求并发不超过 concurrency，
 * 不同源之间完全并行，避免打爆单一 API 的同时整体提速。
 */
async function runPerSourceConcurrent<T, R>(
  tasks: T[],
  concurrency: number,
  fn: (task: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const bySource = new Map<string, { task: T; index: number }[]>()
  tasks.forEach((task, index) => {
    const source = (task as { client: { source: string } }).client.source
    const bucket = bySource.get(source) ?? []
    bucket.push({ task, index })
    bySource.set(source, bucket)
  })
  const results: PromiseSettledResult<R>[] = new Array(tasks.length)
  await Promise.all(
    [...bySource.values()].map(async (bucket) => {
      await runWithLimit(bucket, concurrency, fn, results)
    })
  )
  return results
}

async function runWithLimit<T, R>(
  items: { task: T; index: number }[],
  limit: number,
  fn: (task: T) => Promise<R>,
  results: PromiseSettledResult<R>[]
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const entry = items[cursor++]
      try {
        results[entry.index] = { status: 'fulfilled', value: await fn(entry.task) }
      } catch (reason) {
        results[entry.index] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
}

function specTier(specs: SourceSpec[], source: string): string {
  return specs.find((spec) => spec.source === source)?.tier ?? 'T1'
}

function broadenQuery(query: string): string {
  const tokens = query.split(/\s+/).filter((token) => token.length > 0)
  return tokens.length > 2 ? tokens.slice(0, 2).join(' ') : query
}
