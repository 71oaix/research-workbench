import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import type { AcademicSearchService } from '../../src/search/AcademicSearchService'
import { loadSearchConfig } from '../../src/search/config'
import { ResearcherStepServiceImpl } from '../../src/search/researcherStep'
import type { SearchOutput } from '../../src/search/types'

const { acquireFullTextMock } = vi.hoisted(() => ({
  acquireFullTextMock: vi.fn(),
}))

vi.mock('../../src/evidence/fullText', () => ({
  acquireFullText: acquireFullTextMock,
  fullTextKey: (paper: { title: string }) => paper.title,
  resolvePdfUrls: (paper: { arxivId?: string | null }) =>
    paper.arxivId ? [`https://arxiv.org/pdf/${paper.arxivId}`] : [],
}))

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

  it('filters out papers with zero theme overlap before building cards', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研主题')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })
    const output: SearchOutput = {
      rawPapers: [],
      papers: [
        {
          source: 'semantic-scholar',
          externalId: 'a',
          title: 'Multi-Agent Memory Architecture Research',
          abstract: null,
          authors: [],
          year: 2024,
          doi: null,
          arxivId: null,
          url: null,
          citationCount: 10,
          raw: null,
          sources: ['semantic-scholar'],
        },
        {
          source: 'semantic-scholar',
          externalId: 'b',
          title: 'Completely Unrelated GUI Testing',
          abstract: null,
          authors: [],
          year: 2024,
          doi: null,
          arxivId: null,
          url: null,
          citationCount: 100,
          raw: null,
          sources: ['semantic-scholar'],
        },
      ],
      stats: {
        queryGroups: 1,
        sources: ['semantic-scholar'],
        keywordsUsed: 1,
        queries: 1,
        minCitations: 0,
        totalHits: 2,
        uniquePapers: 2,
        failedSources: [],
        topN: 15,
      },
      groups: [],
    }
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))

    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\nmulti-agent memory architecture',
    })

    expect(result.cardsMd).toContain('Multi-Agent Memory Architecture Research')
    expect(result.cardsMd).not.toContain('Completely Unrelated GUI Testing')
  })

  it('attempts downloads for every paper with an OA candidate', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })
    const papers = Array.from({ length: 12 }, (_, index) => ({
      source: 'semantic-scholar',
      externalId: `s2-${index}`,
      title: `Paper ${index}`,
      abstract: null,
      authors: ['A'],
      year: 2024,
      doi: null,
      arxivId: `2401.0000${index}`,
      url: null,
      citationCount: 10,
      raw: null,
      sources: ['semantic-scholar'],
    }))
    const output: SearchOutput = {
      rawPapers: papers,
      papers,
      stats: {
        queryGroups: 1,
        sources: ['semantic-scholar'],
        keywordsUsed: 1,
        queries: 1,
        minCitations: 0,
        totalHits: 12,
        uniquePapers: 12,
        failedSources: [],
        topN: 15,
      },
      groups: [],
    }
    acquireFullTextMock.mockReset()
    acquireFullTextMock.mockResolvedValue({
      result: { text: 'full text content '.repeat(100), url: 'https://x', source: 'oa' },
      reason: 'ok',
    })
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))

    await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    expect(acquireFullTextMock).toHaveBeenCalledTimes(12)
    expect(acquireFullTextMock.mock.calls.every((call) => call[0].arxivId)).toBe(true)
  })

  it('caps downloads at SEARCH_DOWNLOAD_MAX', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })
    const papers = Array.from({ length: 10 }, (_, index) => ({
      source: 'semantic-scholar',
      externalId: `s2-${index}`,
      title: `Paper ${index}`,
      abstract: null,
      authors: ['A'],
      year: 2024,
      doi: null,
      arxivId: `2401.0000${index}`,
      url: null,
      citationCount: 10,
      raw: null,
      sources: ['semantic-scholar'],
    }))
    const output: SearchOutput = {
      rawPapers: papers,
      papers,
      stats: {
        queryGroups: 1,
        sources: ['semantic-scholar'],
        keywordsUsed: 1,
        queries: 1,
        minCitations: 0,
        totalHits: 10,
        uniquePapers: 10,
        failedSources: [],
        topN: 15,
      },
      groups: [],
    }
    acquireFullTextMock.mockReset()
    acquireFullTextMock.mockResolvedValue({
      result: { text: 'full text content '.repeat(100), url: 'https://x', source: 'oa' },
      reason: 'ok',
    })
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(
      search,
      repos,
      createEventBus(),
      loadSearchConfig({ SEARCH_DOWNLOAD_MAX: '5' })
    )

    await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    expect(acquireFullTextMock).toHaveBeenCalledTimes(5)
  })

  it('numbers full-text sections by card index, skipping failed downloads', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 1,
      requiresApproval: false,
    })
    const papers = ['Paper 0', 'Paper 1', 'Paper 2'].map((title, index) => ({
      source: 'semantic-scholar',
      externalId: `s2-${index}`,
      title,
      abstract: null,
      authors: ['A'],
      year: 2024,
      doi: null,
      arxivId: `2401.0000${index}`,
      url: null,
      citationCount: 10,
      raw: null,
      sources: ['semantic-scholar'],
    }))
    const output: SearchOutput = {
      rawPapers: papers,
      papers,
      stats: {
        queryGroups: 1,
        sources: ['semantic-scholar'],
        keywordsUsed: 1,
        queries: 1,
        minCitations: 0,
        totalHits: 3,
        uniquePapers: 3,
        failedSources: [],
        topN: 15,
      },
      groups: [],
    }
    acquireFullTextMock.mockReset()
    acquireFullTextMock.mockImplementation(async (paper: { title: string }) => {
      if (paper.title === 'Paper 1') return { result: null, reason: 'failed' }
      return {
        result: { text: 'full text content '.repeat(100), url: 'https://x', source: 'oa' },
        reason: 'ok',
      }
    })
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))

    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    const fullText = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'paper-fulltext.md')
    expect(fullText?.content).toContain('## [1] Paper 0')
    expect(fullText?.content).toContain('## [3] Paper 2')
    expect(fullText?.content).not.toContain('## [2]')
    expect(result.cardsMd).toContain('摘要：缺失')
  })
})
