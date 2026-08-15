import type { Paper, SearchStats } from '@research-workbench/shared'

export type { SearchStats }

export type SearchPaper = Omit<Paper, 'id' | 'createdAt'>

export interface KeywordGroup {
  label: string
  query: string
}

export interface AcademicSearchClient {
  readonly source: string
  search(query: string, limit: number): Promise<SearchPaper[]>
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
  }): Promise<{ cardsMd: string }>
}
