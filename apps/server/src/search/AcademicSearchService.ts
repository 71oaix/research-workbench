import type { SearchStats } from '@research-workbench/shared'
import { extractThemeTokens } from '../evidence/evaluation'
import type { SearchConfig } from './config'
import { SearchError } from './errors'
import { SearchHttpError } from './http'
import {
  expandKeywordQueries,
  extractKeywordGroups,
  normalizeArxivQuery,
  parseTimeRange,
} from './keywords'
import { mergeAndRank } from './merge'
import { detectDomain, selectForDomain } from './sources'
import type { SourceSpec } from './sources'
import type {
  AcademicSearchClient,
  KeywordGroup,
  SearchOutput,
  SearchPaper,
} from './types'
import { SourceHealthRegistry } from './sourceHealth'

export interface SearchOptions {
  compensate?: boolean
  gapQueries?: string[]
  onlyGapQueries?: boolean
}

export class AcademicSearchService {
  private readonly health: SourceHealthRegistry

  constructor(
    private readonly specs: SourceSpec[],
    private readonly config: SearchConfig
  ) {
    this.health = new SourceHealthRegistry(config.sourceDegradeCooldownMs)
  }

  async search(planMd: string, options: SearchOptions = {}): Promise<SearchOutput> {
    const baseGroups = options.onlyGapQueries
      ? []
      : extractKeywordGroups(planMd, this.config.maxGroups)
    const gapGroups =
      options.gapQueries?.map((query, index) => ({ label: `gap-${index + 1}`, query })) ?? []
    const groups = [...baseGroups, ...gapGroups].slice(0, this.config.maxGroups)
    const queries = expandKeywordQueries(groups)
    const domain = detectDomain(planMd)
    const selected = selectForDomain(this.specs, domain)
    const clients = selected.map((spec) => spec.create(this.config))
    const limit = options.compensate ? this.config.compensatePerQuery : this.config.perQuery
    const minCitations = options.compensate ? this.config.minCitations : 0
    const timeRange = parseTimeRange(planMd)

    // 进程级健康注册表：冷却期内的源直接跳过（计为降级），冷却结束自动重探
    const downSources = new Set(
      selected.filter((spec) => this.health.isDown(spec.source)).map((spec) => spec.source)
    )
    const activeClients = clients.filter((client) => !downSources.has(client.source))
    if (activeClients.length === 0) {
      throw new SearchError(
        `所有检索源处于降级状态（${[...downSources].join('、')}），请稍后重试或检查源配置`
      )
    }

    const failed: string[] = []
    const degradedSources: string[] = []
    let compensatedQueries = 0
    const rawPapers: SearchPaper[] = []
    const tasks = queries.flatMap((query) =>
      activeClients.map((client) => ({ query, client, tier: specTier(selected, client.source) }))
    )

    const { results, circuits } = await runPerSourceConcurrent(
      tasks,
      this.config.sourceConcurrency,
      (task) => this.searchOne(task.client, task.query, limit, timeRange ?? undefined),
      3
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        rawPapers.push(...result.value)
      }
    })

    // 源级结果分类：degraded（预算 429 / T3 降级 / 健康注册跳过）vs failed（真实失败）
    const outcomeBySource = new Map<
      string,
      { tier: string; failed: number; skipped: number; nonRetryable: boolean }
    >()
    for (const spec of selected) {
      outcomeBySource.set(spec.source, {
        tier: spec.tier,
        failed: 0,
        skipped: 0,
        nonRetryable: false,
      })
    }
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const { client, tier } = tasks[index]
        const entry = outcomeBySource.get(client.source) ?? {
          tier,
          failed: 0,
          skipped: 0,
          nonRetryable: false,
        }
        entry.failed++
        if (result.reason instanceof SearchHttpError && result.reason.nonRetryable) {
          entry.nonRetryable = true
        }
        outcomeBySource.set(client.source, entry)
      }
    })
    for (const [source, circuit] of circuits) {
      if (circuit.tripped && circuit.skipped > 0) {
        const tier = specTier(selected, source)
        const entry = outcomeBySource.get(source) ?? {
          tier,
          failed: 0,
          skipped: 0,
          nonRetryable: false,
        }
        entry.skipped = circuit.skipped
        outcomeBySource.set(source, entry)
      }
    }

    for (const [source, entry] of outcomeBySource) {
      if (downSources.has(source) || entry.nonRetryable || (entry.tier === 'T3' && entry.failed > 0)) {
        degradedSources.push(`${source}(${entry.tier})`)
        this.health.markDown(source)
        continue
      }
      const parts: string[] = []
      if (entry.failed > 0) parts.push(`失败 ${entry.failed} 个查询`)
      if (entry.skipped > 0) parts.push(`熔断跳过 ${entry.skipped} 个查询`)
      if (parts.length > 0) failed.push(`${source}(${entry.tier}) ${parts.join('，')}`)
    }

    // 降级补偿：稳定失效源的任务重跑在存活源上（limit=compensatePerQuery）
    const deadSourceNames = new Set(
      degradedSources.map((label) => label.split('(')[0])
    )
    const aliveClients = activeClients.filter((client) => !deadSourceNames.has(client.source))
    const compensatedPapers: SearchPaper[] = []
    if (this.config.compensateOnDegrade && deadSourceNames.size > 0 && aliveClients.length > 0) {
      const compensateLimit = this.config.compensatePerQuery
      const deadIndexes = results
        .map((result, index) => ({ result, index }))
        .filter(
          ({ result, index }) =>
            result.status === 'rejected' && deadSourceNames.has(tasks[index].client.source)
        )
        .map(({ index }) => index)
      for (const index of deadIndexes) {
        const task = tasks[index]
        const settled = await Promise.allSettled(
          aliveClients.map((client) =>
            this.searchOne(client, task.query, compensateLimit, timeRange ?? undefined)
          )
        )
        settled.forEach((entry) => {
          if (entry.status === 'fulfilled' && Array.isArray(entry.value)) {
            compensatedPapers.push(...entry.value)
          }
        })
        compensatedQueries += aliveClients.length
      }
    }

    const allPapers = [...rawPapers, ...compensatedPapers]
    if (allPapers.length === 0 && (failed.length > 0 || degradedSources.length > 0)) {
      throw new SearchError(
        `所有检索源失败/降级：${[...failed, ...degradedSources].join('、')}`
      )
    }

    const theme = extractThemeTokens(planMd)
    const merged = mergeAndRank(allPapers, this.config.topN, {
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
      gapQueries: options.gapQueries?.length ?? 0,
      minCitations,
      totalHits: merged.stats.totalHits,
      uniquePapers: merged.stats.uniquePapers,
      failedSources: [...new Set(failed)],
      degradedSources: [...new Set(degradedSources)],
      compensatedQueries,
      skippedPapers: merged.stats.skippedPapers,
      topN: this.config.topN,
    }

    return { rawPapers, papers: ranked, stats, groups }
  }

  private async searchOne(
    client: AcademicSearchClient,
    query: KeywordGroup,
    limit: number,
    filters?: { yearFrom?: number; yearTo?: number }
  ): Promise<SearchPaper[]> {
    let q = query.query
    if (client.source === 'arxiv') {
      const normalized = normalizeArxivQuery(query.query)
      if (!normalized) return []
      q = normalized
    }
    let papers = await client.search(q, limit, filters)
    if (papers.length === 0) {
      const broadened = broadenQuery(q)
      if (broadened !== q) {
        papers = await client.search(broadened, limit, filters)
      }
    }
    if (papers.length === 0) {
      const first = firstToken(q)
      const broadened = broadenQuery(q)
      if (first && first !== q && first !== broadened) {
        papers = await client.search(first, limit, filters)
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
  fn: (task: T) => Promise<R>,
  maxFailures: number
): Promise<{
  results: PromiseSettledResult<R>[]
  circuits: Map<string, { failures: number; tripped: boolean; skipped: number }>
}> {
  const bySource = new Map<string, { task: T; index: number }[]>()
  tasks.forEach((task, index) => {
    const source = (task as { client: { source: string } }).client.source
    const bucket = bySource.get(source) ?? []
    bucket.push({ task, index })
    bySource.set(source, bucket)
  })
  const results: PromiseSettledResult<R>[] = new Array(tasks.length)
  const circuits = new Map<string, { failures: number; tripped: boolean; skipped: number }>()
  await Promise.all(
    [...bySource.entries()].map(async ([source, bucket]) => {
      const circuit = { failures: 0, tripped: false, skipped: 0 }
      circuits.set(source, circuit)
      let cursor = 0
      const workers = Array.from(
        { length: Math.min(concurrency, bucket.length) },
        async () => {
          while (cursor < bucket.length) {
            const entry = bucket[cursor++]
            if (circuit.tripped) {
              circuit.skipped++
              results[entry.index] = { status: 'fulfilled', value: undefined as R }
              continue
            }
            try {
              results[entry.index] = { status: 'fulfilled', value: await fn(entry.task) }
              circuit.failures = 0
            } catch (reason) {
              circuit.failures++
              const permanent = reason instanceof SearchHttpError && reason.nonRetryable
              if (circuit.failures >= maxFailures || permanent) circuit.tripped = true
              results[entry.index] = { status: 'rejected', reason }
            }
          }
        }
      )
      await Promise.all(workers)
    })
  )
  return { results, circuits }
}

function specTier(specs: SourceSpec[], source: string): string {
  return specs.find((spec) => spec.source === source)?.tier ?? 'T1'
}

function broadenQuery(query: string): string {
  const tokens = query.split(/\s+/).filter((token) => token.length > 0)
  return tokens.length > 2 ? tokens.slice(0, 2).join(' ') : query
}

function firstToken(query: string): string {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return tokens[0] ?? ''
}
