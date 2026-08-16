import path from 'node:path'
import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import { acquireFullText, fullTextKey } from '../evidence/fullText'
import { extractThemeTokens, hasIntersection, tokenize } from '../evidence/evaluation'
import type { AcademicSearchService } from './AcademicSearchService'
import { buildResearchCards } from './cards'
import type { SearchConfig } from './config'
import type { ResearcherStepService } from './types'

export class ResearcherStepServiceImpl implements ResearcherStepService {
  constructor(
    private readonly search: AcademicSearchService,
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus,
    private readonly config: SearchConfig
  ) {}

  async prepare(input: {
    workflowId: string
    stepId: string
    planContent: string
    compensate?: boolean
  }): Promise<{ cardsMd: string }> {
    const output = await this.search.search(input.planContent, {
      compensate: input.compensate ?? false,
    })
    output.papers = filterRelevantPapers(output.papers, input.planContent)

    const fullTextByKey = new Map<string, string>()
    for (const paper of output.papers.slice(0, this.config.readTop)) {
      const result = await acquireFullText(paper, {
        dir: path.join(process.cwd(), 'data', 'pdfs'),
        maxChars: this.config.fullTextMaxChars,
      })
      paper.fullText = result?.text ?? null
      if (result?.text) fullTextByKey.set(fullTextKey(paper), result.text)
    }

    for (const paper of output.rawPapers) {
      const text = fullTextByKey.get(fullTextKey(paper))
      if (text) paper.fullText = text
      this.repos.papers.upsert(paper)
    }

    const cardsMd = buildResearchCards(output.papers, output.stats, output.groups)
    const cardsArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'research-cards.md',
      content: cardsMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact: cardsArtifact })

    const fullTextMd = buildFullTextMd(output.papers)
    if (fullTextMd) {
      const artifact = this.repos.artifacts.create({
        workflowId: input.workflowId,
        stepId: input.stepId,
        name: 'paper-fulltext.md',
        content: fullTextMd,
      })
      this.bus.emit({ type: 'artifact.updated', artifact })
    }

    this.bus.emit({
      type: 'search.completed',
      workflowId: input.workflowId,
      stepId: input.stepId,
      stats: output.stats,
    })

    return { cardsMd }
  }
}

function filterRelevantPapers<T extends { title: string; abstract: string | null }>(
  papers: T[],
  planMd: string
): T[] {
  const theme = extractThemeTokens(planMd)
  if (theme.size === 0 || papers.length === 0) return papers
  const relevant = papers.filter((paper) =>
    hasIntersection(tokenize(`${paper.title} ${paper.abstract ?? ''}`.slice(0, 400)), theme)
  )
  return relevant.length > 0 ? relevant : papers
}

function buildFullTextMd(papers: { title: string; fullText?: string | null }[]): string {
  const withText = papers.filter((paper) => Boolean(paper.fullText))
  if (withText.length === 0) return ''
  const sections = withText.map(
    (paper, index) => `## [${index + 1}] ${paper.title}\n\n${paper.fullText}`
  )
  return ['# 论文全文（阅读证据）', '', ...sections].join('\n\n')
}
