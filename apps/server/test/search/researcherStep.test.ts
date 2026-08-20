import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import type { AcademicSearchService } from '../../src/search/AcademicSearchService'
import { loadSearchConfig } from '../../src/search/config'
import { ResearcherStepServiceImpl } from '../../src/search/researcherStep'
import type { SearchOutput } from '../../src/search/types'

function makePaper(title: string, index: number, overrides: Record<string, unknown> = {}) {
  return {
    source: 'semantic-scholar',
    externalId: `s2-${index}`,
    title,
    abstract: null,
    authors: ['A'],
    year: 2024,
    doi: null,
    arxivId: null,
    url: null,
    citationCount: 10,
    raw: null,
    ...overrides,
  }
}

function makeOutput(papers: ReturnType<typeof makePaper>[]): SearchOutput {
  return {
    rawPapers: papers,
    papers: papers.map((paper, index) => ({
      ...paper,
      sources: ['semantic-scholar'],
      externalId: paper.externalId ?? `s2-${index}`,
    })),
    stats: {
      queryGroups: 1,
      sources: ['semantic-scholar'],
      keywordsUsed: 1,
      queries: 1,
      minCitations: 0,
      totalHits: papers.length,
      uniquePapers: papers.length,
      failedSources: [],
      topN: 15,
    },
    groups: [{ label: 'g1', query: 'paper' }],
  }
}

describe('ResearcherStepServiceImpl（候选池阶段）', () => {
  it('persists candidate artifacts (md + json) and emits search events, without downloading', async () => {
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

    const output = makeOutput([
      makePaper('Paper One', 1, { doi: '10.1/one' }),
      makePaper('Paper Two', 2),
    ])
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(search, repos, bus, loadSearchConfig({}))

    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    expect(result.candidatesMd).toContain('# 检索候选池')
    expect(result.candidatesMd).toContain('### [1] Paper One')
    const names = repos.artifacts.listByWorkflow(workflow.id).map((artifact) => artifact.name)
    expect(names).toContain('research-candidates.md')
    expect(names).toContain('research-candidates.json')
    expect(names).not.toContain('research-cards.md')
    const jsonArtifact = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'research-candidates.json')
    const bundle = JSON.parse(jsonArtifact?.content ?? '{}')
    expect(bundle.papers).toHaveLength(2)
    expect(bundle.papers[0].doi).toBe('10.1/one')

    const types = new Set(events.map((event) => event.type))
    expect(types.has('artifact.updated')).toBe(true)
    expect(types.has('search.completed')).toBe(true)
  })

  it('filters out papers with zero theme overlap before building candidates', async () => {
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
    const output = makeOutput([
      makePaper('Multi-Agent Memory Architecture Research', 1),
      makePaper('Completely Unrelated GUI Testing', 2),
    ])
    const search = { search: vi.fn().mockResolvedValue(output) } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(
      search,
      repos,
      createEventBus(),
      loadSearchConfig({})
    )

    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\nmulti-agent memory architecture',
    })

    expect(result.candidatesMd).toContain('Multi-Agent Memory Architecture Research')
    expect(result.candidatesMd).not.toContain('Completely Unrelated GUI Testing')
  })

  it('caps candidates at SEARCH_CANDIDATE_TOP', async () => {
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
    const papers = Array.from({ length: 10 }, (_, index) => makePaper(`Paper ${index}`, index))
    const search = {
      search: vi.fn().mockResolvedValue(makeOutput(papers)),
    } as unknown as AcademicSearchService
    const service = new ResearcherStepServiceImpl(
      search,
      repos,
      createEventBus(),
      loadSearchConfig({ SEARCH_CANDIDATE_TOP: '5' })
    )

    await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      planContent: '## 检索关键词\n- paper',
    })

    const jsonArtifact = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'research-candidates.json')
    const bundle = JSON.parse(jsonArtifact?.content ?? '{}')
    expect(bundle.papers).toHaveLength(5)
  })
})
