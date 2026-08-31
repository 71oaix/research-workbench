import type { Artifact, Decision, Step, UsageSummary, Workflow } from '@research-workbench/shared'

export interface WorkflowDetail {
  workflow: Workflow
  steps: Step[]
  artifacts: Artifact[]
  decisions: Decision[]
  usageSummary: UsageSummary[]
}

interface StepSpecInput {
  label: string
  role:
    | 'planner'
    | 'researcher'
    | 'selector'
    | 'writer'
    | 'evaluator'
    | 'reviewer'
    | 'summarizer'
  requiresApproval: boolean
}

const FULL_STEPS: StepSpecInput[] = [
  { label: '生成检索计划', role: 'planner', requiresApproval: true },
  { label: '检索文献', role: 'researcher', requiresApproval: true },
  { label: '筛选证据', role: 'selector', requiresApproval: false },
  { label: '撰写综述', role: 'writer', requiresApproval: true },
  { label: '评估证据', role: 'evaluator', requiresApproval: false },
  { label: '审查引用', role: 'reviewer', requiresApproval: true },
  { label: '归纳整理', role: 'summarizer', requiresApproval: false },
]

const RESEARCH_STEPS = FULL_STEPS.filter((step) => step.role !== 'writer')

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json() as Promise<T>
}

export const api = {
  listWorkflows: () => request<Workflow[]>('/workflows'),
  createWorkflow: (goal: string, includeWriter = true) =>
    request<WorkflowDetail>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ goal, steps: includeWriter ? FULL_STEPS : RESEARCH_STEPS }),
    }),
  startWorkflow: (workflowId: string) =>
    request<WorkflowDetail>(`/workflows/${workflowId}/start`, { method: 'POST' }),
  cancelWorkflow: (workflowId: string) =>
    request<WorkflowDetail>(`/workflows/${workflowId}/cancel`, { method: 'POST' }),
  getWorkflow: (workflowId: string) => request<WorkflowDetail>(`/workflows/${workflowId}`),
  decide: (
    workflowId: string,
    stepId: string,
    type: 'approve' | 'modify' | 'reject',
    note?: string
  ) =>
    request<WorkflowDetail>(`/workflows/${workflowId}/steps/${stepId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ type, note: note ?? null }),
    }),
}
