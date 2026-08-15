import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import type { AcademicSearchService } from '../../src/search/AcademicSearchService'
import { loadSearchConfig } from '../../src/search/config'
import { ResearcherStepServiceImpl } from '../../src/search/researcherStep'
import type { SearchOutput } from '../../src/search/types'

describe('ResearcherStepServiceImpl', () => {
  it('persists raw papers, creates research-cards.md and emits search events', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((event) => events.push(event))

    const workflow = repos.workflows.create('调研主题')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })

    const output: SearchOutput = {
      rawPapers: [
        {
          source: 'semantic-scholar',
          externalId: 's2-1',
          title: 'Paper One',
          abstract: null,
          authors: ['A'],
          year: 2024,
          doi: '10.1/one',
          arxivId: null,
          url: 'https://example.com/one',
          citationCount: 10,
          raw: null,
        },
        {
          source: 'openalex',
          externalId: 'W1',
          title: 'Paper One',
          abstract: null,
          authors: ['A', 'B'],
          year: 2024,
          doi: '10.1/one',
          arxivId: null,
          url: null,
          citationCount: 12,
          raw: null,
        },
      ],
      papers: [
        {
          source: 'semantic-scholar',
          externalId: 's2-1',
          title: 'Paper One',
          abstract: null,
          authors: ['A', 'B'],
          year: 2024,
          doi: '10.1/one',
          arxivId: null,
          url: 'https://example.com/one',
          citationCount: 12,
          raw: null,
          sources: ['semantic-scholar', 'openalex'],
        },
      ],
      stats: {
        queryGroups: 1,
        sources: ['semantic-scholar', 'openalex'],
        keywordsUsed: 1,
        queries: 2,
        minCitations: 0,
        totalHits: 2,
        uniquePapers: 1,
        failedSources: [],
        topN: 15,
      },
      groups: [{ label: 'g1', query: 'paper' }],
    }
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(search, repos, bus, loadSearchConfig({}))

    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    expect(result.cardsMd).toContain('# 检索证据卡片')
    expect(result.cardsMd).toContain('### [1] Paper One')
    expect(repos.papers.list()).toHaveLength(2)
    expect(repos.artifacts.listByWorkflow(workflow.id).map((a) => a.name)).toContain(
      'research-cards.md'
    )
    const types = new Set(events.map((event) => event.type))
    expect(types.has('artifact.updated')).toBe(true)
    expect(types.has('search.completed')).toBe(true)
    const searchEvent = events.find((event) => event.type === 'search.completed')
    expect(searchEvent).toMatchObject({
      type: 'search.completed',
      workflowId: workflow.id,
      stepId: step.id,
      stats: output.stats,
    })
  })
})
