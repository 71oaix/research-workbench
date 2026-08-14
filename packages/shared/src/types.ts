export type Role = 'planner' | 'researcher' | 'writer' | 'reviewer'

export type WorkflowStatus =
  | 'planning'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'skipped'

export type DecisionType = 'approve' | 'reject' | 'modify' | 'retry'

export interface Workflow {
  id: string
  goal: string
  status: WorkflowStatus
  createdAt: string
  updatedAt: string
}

export interface Step {
  id: string
  workflowId: string
  label: string
  role: Role
  status: StepStatus
  inputArtifacts: string[]
  outputArtifact: string | null
  agentRuntimeId: string | null
  createdAt: string
  updatedAt: string
}

export interface Artifact {
  id: string
  workflowId: string
  stepId: string | null
  name: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface Paper {
  id: string
  source: string
  externalId: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  citationCount: number | null
  raw: string | null
  createdAt: string
}

export interface Decision {
  id: string
  workflowId: string
  stepId: string | null
  type: DecisionType
  note: string | null
  createdAt: string
}

export interface UsageRecord {
  id: string
  workflowId: string | null
  stepId: string | null
  role: Role | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costCny: number
  createdAt: string
}
