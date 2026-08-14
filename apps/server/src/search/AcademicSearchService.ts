import type { SearchStats } from '@research-workbench/shared'
import type { SearchConfig } from './config'
import { SearchError } from './errors'
import { extractKeywordGroups } from './keywords'
import { mergeAndRank } from './merge'
import type {
  AcademicSearchClient,
  KeywordGroup,
  MergedPaper,
  SearchOutput,
  SearchPaper,
} from './types'

export class AcademicSearchService {
  constructor(
    private readonly clients: AcademicSearchClient[],
    private readonly config: SearchConfig
  ) {}

  async search(planMd: string): Promise<SearchOutput> {
    const groups = extractKeywordGroups(planMd)
    const tasks = groups.flatMap((group) =>
      this.clients.map((client) => ({ group, client }))
    )

    const failed: string[] = []
    const rawPapers: SearchPaper[] = []
    const settled = await Promise.allSettled(
      tasks.map(({ group, client }) => this.searchOne(client, group))
    )

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        rawPapers.push(...result.value)
      } else {
        const { group, client } = tasks[index]
        failed.push(`${client.source}（${group.query.slice(0, 20)}）`)
      }
    })

    if (rawPapers.length === 0 && failed.length === tasks.length) {
      throw new SearchError(`所有检索源失败：${failed.join('、')}`)
    }

    const merged = mergeAndRank(rawPapers, this.config.topN)
    const stats: SearchStats = {
      queryGroups: groups.length,
      sources: this.clients.map((client) => client.source),
      totalHits: merged.stats.totalHits,
      uniquePapers: merged.stats.uniquePapers,
      failedSources: [...new Set(failed)],
      topN: this.config.topN,
    }

    return {
      rawPapers,
      papers: merged.papers,
      stats,
      groups,
    }
  }

  private async searchOne(
    client: AcademicSearchClient,
    group: KeywordGroup
  ): Promise<SearchPaper[]> {
    try {
      return await client.search(group.query, this.config.perQuery)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      throw new SearchError(`[${client.source}] ${group.query}：${message}`)
    }
  }
}
