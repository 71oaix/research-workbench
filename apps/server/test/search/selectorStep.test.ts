import { describe, expect, it, vi } from 'vitest'
import type { Artifact } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import type { AcademicSearchService } from '../../src/search/AcademicSearchService'
import { loadSearchConfig } from '../../src/search/config'
import { parseSelectorOutput, SelectorStepServiceImpl } from '../../src/search/SelectorStepService'
import type { MergedPaper, SearchOutput } from '../../src/search/types'

const { acquireFullTextMock } = vi.hoisted(() => ({
  acquireFullTextMock: vi.fn(),
}))

vi.mock('../../src/evidence/fullText', () => ({
  acquireFullText: acquireFullTextMock,
  fullTextKey: (paper: { doi?: string | null; arxivId?: string | null; title: string }) =>
    paper.doi ? `doi:${paper.doi}` : paper.arxivId ? `arxiv:${paper.arxivId}` : `title:${paper.title}`,
}))

function makeCandidate(title: string, index: number, overrides: Partial<MergedPaper> = {}): MergedPaper {
  return {
    source: 'semantic-scholar',
    externalId: `s2-${index}`,
    title,
    abstract: `Abstract of ${title}`,
    authors: ['A'],
    year: 2024,
    doi: index % 2 === 0 ? `10.1/${index}` : null,
    arxivId: null,
    url: null,
    citationCount: 10,
    raw: null,
    sources: ['semantic-scholar'],
    ...overrides,
  }
}

function makeCandidatesArtifacts(workflowId: string, _stepId: string, papers: MergedPaper[]) {
  const repos = createRepositories(createDb())
  const workflow = repos.workflows.create('调研')
  const step = repos.steps.create({
    workflowId: workflow.id,
    label: '筛选证据',
    role: 'selector',
    position: 2,
    requiresApproval: false,
  })
  const md = repos.artifacts.create({
    workflowId: workflow.id,
    stepId: step.id,
    name: 'research-candidates.md',
    content: '# 检索候选池\n\n### [1] ' + papers[0].title,
  })
  const json = repos.artifacts.create({
    workflowId: workflow.id,
    stepId: step.id,
    name: 'research-candidates.json',
    content: JSON.stringify({
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
      papers,
    }),
  })
  const plan = repos.artifacts.create({
    workflowId: workflow.id,
    stepId: null,
    name: '01-plan.md',
    content: '# 计划\n\n## 研究问题\n多智能体记忆\n\n## 检索关键词\n- multi-agent memory',
  })
  return { repos, workflow, step, artifacts: [md, json, plan] as Artifact[] }
}

describe('parseSelectorOutput', () => {
  it('parses judgements, relevance levels, reasons and gap suggestions', () => {
    const content = [
      '### [1] 判定：入选',
      '- 相关度：高',
      '- 理由：直接覆盖多智能体记忆分类',
      '',
      '### [2] 判定：剔除',
      '- 理由：与问题无关',
      '',
      '### [3] 判定：入选',
      '- 相关度：部分',
      '- 理由：相关但仅覆盖侧面',
      '',
      '## 二次检索建议',
      '- episodic memory agent',
      '- memory consolidation survey',
    ].join('\n')
    const output = parseSelectorOutput(content)
    expect(output.selections).toEqual([
      { index: 1, selected: true, level: 'high', reason: '直接覆盖多智能体记忆分类' },
      { index: 2, selected: false, level: null, reason: '与问题无关' },
      { index: 3, selected: true, level: 'partial', reason: '相关但仅覆盖侧面' },
    ])
    expect(output.gapQueries).toEqual(['episodic memory agent', 'memory consolidation survey'])
  })

  it('returns empty selections when nothing parseable', () => {
    expect(parseSelectorOutput('# 空输出')).toEqual({ selections: [], gapQueries: [] })
  })
})

describe('SelectorStepServiceImpl', () => {
  it('prepare builds promptExtra with candidates and plan anchors', async () => {
    const papers = [makeCandidate('Paper A', 1), makeCandidate('Paper B', 2)]
    const { repos, workflow, step, artifacts } = makeCandidatesArtifacts('wf', 'step', papers)
    const service = new SelectorStepServiceImpl(
      {} as unknown as AcademicSearchService,
      repos,
      createEventBus(),
      loadSearchConfig({})
    )
    const result = await service.prepare({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: artifacts,
    })
    expect(result.candidates).toHaveLength(2)
    expect(result.promptExtra).toContain('检索候选池')
    expect(result.promptExtra).toContain('研究计划（锚点）')
    expect(result.planContent).toContain('多智能体记忆')
  })

  it('stage parses selections, runs gap search and produces a next prompt for new papers', async () => {
    const papers = [makeCandidate('Paper A', 1), makeCandidate('Paper B', 2)]
    const { repos } = makeCandidatesArtifacts('wf', 'step', papers)
    const gapPaper = makeCandidate('New Gap Paper', 99, {
      source: 'openalex',
      externalId: 'W999',
      sources: ['openalex'],
      doi: null,
    })
    const gapOutput: SearchOutput = {
      rawPapers: [gapPaper],
      papers: [gapPaper],
      stats: {
        queryGroups: 1,
        sources: ['openalex'],
        keywordsUsed: 1,
        queries: 1,
        minCitations: 0,
        totalHits: 1,
        uniquePapers: 1,
        failedSources: [],
        topN: 15,
      },
      groups: [{ label: 'gap-1', query: 'episodic memory agent' }],
    }
    const search = { search: vi.fn().mockResolvedValue(gapOutput) } as unknown as AcademicSearchService
    const service = new SelectorStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))

    const output = [
      '### [1] 判定：入选',
      '- 相关度：高',
      '- 理由：核心论文',
      '### [2] 判定：剔除',
      '- 理由：无关',
      '',
      '## 二次检索建议',
      '- episodic memory agent',
    ].join('\n')
    const { nextPrompt, state } = await service.stage({
      output,
      candidates: papers,
      planContent: '## 检索关键词\n- paper',
      stats: gapOutput.stats,
      groups: gapOutput.groups,
    })

    expect(search.search).toHaveBeenCalledWith(
      '## 检索关键词\n- paper',
      expect.objectContaining({ gapQueries: ['episodic memory agent'], onlyGapQueries: true })
    )
    expect(state.selections).toHaveLength(2)
    expect(state.selections[0]).toMatchObject({ index: 1, selected: true, level: 'high' })
    expect(state.newPapers).toHaveLength(1)
    expect(state.newPapers[0].title).toBe('New Gap Paper')
    expect(nextPrompt).toContain('二次检索 / 引文雪球新增候选')
    expect(nextPrompt).toContain('New Gap Paper')
  })

  it('stage falls back to all-selected when the model output cannot be parsed', async () => {
    const papers = [makeCandidate('Paper A', 1), makeCandidate('Paper B', 2)]
    const { repos } = makeCandidatesArtifacts('wf', 'step', papers)
    const search = { search: vi.fn() } as unknown as AcademicSearchService
    const service = new SelectorStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))

    const { state } = await service.stage({
      output: '# 无法解析的模型输出',
      candidates: papers,
      planContent: '## 检索关键词\n- paper',
      stats: {} as SearchOutput['stats'],
      groups: [],
    })
    expect(state.selections.every((selection) => selection.selected)).toBe(true)
    expect(state.selections[0].reason).toContain('解析失败')
  })

  it('commit downloads only selected papers, builds cards with levels and writes artifacts', async () => {
    const papers = [
      makeCandidate('Paper High', 1),
      makeCandidate('Paper Partial', 2),
      makeCandidate('Paper Rejected', 3),
    ]
    const { repos, workflow, step } = makeCandidatesArtifacts('wf', 'step', papers)
    acquireFullTextMock.mockReset()
    acquireFullTextMock.mockResolvedValue({
      result: { text: 'full text '.repeat(100), url: 'https://x', source: 'oa' },
      reason: 'ok',
    })
    const search = { search: vi.fn() } as unknown as AcademicSearchService
    const service = new SelectorStepServiceImpl(search, repos, createEventBus(), loadSearchConfig({}))
    const state = {
      candidates: papers,
      selections: [
        { index: 1, selected: true, level: 'high' as const, reason: '核心论文' },
        { index: 2, selected: true, level: 'partial' as const, reason: '侧面相关' },
        { index: 3, selected: false, level: null, reason: '无关' },
      ],
      gapQueries: [],
      newPapers: [],
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
      groups: [{ label: 'g1', query: 'paper' }],
    }

    const result = await service.commit({
      workflowId: workflow.id,
      stepId: step.id,
      state,
      nextOutput: null,
    })

    expect(acquireFullTextMock).toHaveBeenCalledTimes(2)
    const names = repos.artifacts.listByWorkflow(workflow.id).map((artifact) => artifact.name)
    expect(names).toContain('research-cards.md')
    expect(names).toContain('paper-fulltext.md')
    expect(names).toContain('selector-report.md')
    expect(result.cardsMd).toContain('### [1] Paper High')
    expect(result.cardsMd).toContain('相关度：高')
    expect(result.cardsMd).toContain('筛选理由：核心论文')
    expect(result.cardsMd).toContain('筛选：候选 3 篇 → 入选 2 篇（高相关 1 / 部分相关 1）')
    expect(result.cardsMd).not.toContain('Paper Rejected')
  })
})
