import type { Paper, SearchStats } from '@research-workbench/shared'
import type { RerankEntry } from './rerank'

export type { SearchStats }

export type SearchPaper = Omit<Paper, 'id' | 'createdAt'> & {
  relevanceLevel?: 'high' | 'partial' | null
  selectionReason?: string | null
}

export interface KeywordGroup {
  label: string
  query: string
}

export interface SearchFilters {
  yearFrom?: number
  yearTo?: number
}

export interface AcademicSearchClient {
  readonly source: string
  search(query: string, limit: number, filters?: SearchFilters): Promise<SearchPaper[]>
}

export interface MergedPaper extends SearchPaper {
  sources: string[]
}

export interface SearchOutput {
  rawPapers: SearchPaper[]
  papers: MergedPaper[]
  stats: SearchStats
  groups: KeywordGroup[]
}

export interface ResearcherStepService {
  prepare(input: {
    workflowId: string
    stepId: string
    planContent: string
    compensate?: boolean
  }): Promise<{ candidatesMd: string }>
}

export interface SelectorSelection {
  index: number
  selected: boolean
  level: 'high' | 'partial' | null
  reason: string
}

export interface SelectorOutput {
  selections: SelectorSelection[]
  gapQueries: string[]
}

export interface SelectorStageState {
  candidates: MergedPaper[]
  selections: SelectorSelection[]
  gapQueries: string[]
  newPapers: MergedPaper[]
  stats: SearchStats
  groups: KeywordGroup[]
  rerank?: RerankEntry[]
}

export interface SelectorStepService {
  prepare(input: {
    workflowId: string
    stepId: string
    inputArtifacts: import('@research-workbench/shared').Artifact[]
  }): Promise<{
    promptExtra: string
    candidates: MergedPaper[]
    planContent: string
    stats: SearchStats
    groups: KeywordGroup[]
  }>
  stage(input: {
    output: string
    candidates: MergedPaper[]
    planContent: string
    stats: SearchStats
    groups: KeywordGroup[]
  }): Promise<{ nextPrompt: string | null; state: SelectorStageState }>
  commit(input: {
    workflowId: string
    stepId: string
    state: SelectorStageState
    nextOutput: string | null
  }): Promise<{ cardsMd: string }>
}
