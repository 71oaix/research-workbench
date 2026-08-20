import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import { extractThemeTokens, hasIntersection, tokenize } from '../evidence/evaluation'
import type { AcademicSearchService } from './AcademicSearchService'
import { buildResearchCandidates } from './cards'
import type { SearchConfig } from './config'
import { mergeAndRank } from './merge'
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
  }): Promise<{ candidatesMd: string }> {
    const output = await this.search.search(input.planContent, {
      compensate: input.compensate ?? false,
    })
    // 候选池取全量命中合并去重后的前 candidateTop 篇（不受 topN=15 截断）
    const mergedAll = mergeAndRank(output.rawPapers, this.config.candidateTop)
    const relevant = filterRelevantPapers(mergedAll.papers, input.planContent)
    const candidates = relevant.slice(0, this.config.candidateTop)
    const candidateStats: typeof output.stats = {
      ...output.stats,
      totalHits: output.rawPapers.length,
      uniquePapers: mergedAll.stats.uniquePapers,
      topN: this.config.candidateTop,
    }

    // 候选池双产物：md 给人/模型看，json 给 selector 代码用（保留结构化字段与 OA 原始信息）
    const candidatesMd = buildResearchCandidates(candidates, candidateStats, output.groups)
    const mdArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'research-candidates.md',
      content: candidatesMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact: mdArtifact })
    const jsonArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'research-candidates.json',
      content: JSON.stringify({
        stats: candidateStats,
        groups: output.groups,
        papers: candidates,
      }),
    })
    this.bus.emit({ type: 'artifact.updated', artifact: jsonArtifact })

    this.bus.emit({
      type: 'search.completed',
      workflowId: input.workflowId,
      stepId: input.stepId,
      stats: output.stats,
    })

    return { candidatesMd }
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
