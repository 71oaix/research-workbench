import type { Artifact, Decision, Step, Workflow } from '@research-workbench/shared'

export interface WorkflowDetail {
  workflow: Workflow
  steps: Step[]
  artifacts: Artifact[]
  decisions: Decision[]
}

interface StepSpecInput {
  label: string
  role: 'planner' | 'researcher' | 'writer' | 'reviewer'
  requiresApproval: boolean
}

const DEFAULT_STEPS: StepSpecInput[] = [
  { label: '生成检索计划', role: 'planner', requiresApproval: true },
  { label: '检索文献', role: 'researcher', requiresApproval: false },
  { label: '撰写综述', role: 'writer', requiresApproval: false },
  { label: '审查引用', role: 'reviewer', requiresApproval: true },
]

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
  createWorkflow: (goal: string) =>
    request<WorkflowDetail>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ goal, steps: DEFAULT_STEPS }),
    }),
  startWorkflow: (workflowId: string) =>
    request<WorkflowDetail>(`/workflows/${workflowId}/start`, { method: 'POST' }),
  getWorkflow: (workflowId: string) => request<WorkflowDetail>(`/workflows/${workflowId}`),
  decide: (workflowId: string, stepId: string, type: 'approve' | 'reject', note?: string) =>
    request<WorkflowDetail>(`/workflows/${workflowId}/steps/${stepId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ type, note: note ?? null }),
    }),
}
