import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import type { AcademicSearchService } from './AcademicSearchService'
import { buildResearchCards } from './cards'
import type { ResearcherStepService } from './types'

export class ResearcherStepServiceImpl implements ResearcherStepService {
  constructor(
    private readonly search: AcademicSearchService,
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus
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
    for (const paper of output.rawPapers) {
      this.repos.papers.upsert(paper)
    }

    const cardsMd = buildResearchCards(output.papers, output.stats, output.groups)
    const artifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'research-cards.md',
      content: cardsMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact })
    this.bus.emit({
      type: 'search.completed',
      workflowId: input.workflowId,
      stepId: input.stepId,
      stats: output.stats,
    })

    return { cardsMd }
  }
}
