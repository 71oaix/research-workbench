import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artifact, Step, Workflow } from '@research-workbench/shared'
import { useWorkflowStore } from '../src/store'

const workflow: Workflow = {
  id: 'wf-1',
  goal: '调研',
  status: 'planning',
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
}

const step: Step = {
  id: 's1',
  workflowId: 'wf-1',
  label: '生成检索计划',
  role: 'planner',
  status: 'running',
  position: 0,
  requiresApproval: true,
  inputArtifacts: [],
  outputArtifact: null,
  agentRuntimeId: null,
  pendingFeedback: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
}

const artifact: Artifact = {
  id: 'a1',
  workflowId: 'wf-1',
  stepId: 's1',
  name: '01-plan.md',
  content: '# 计划',
  version: 1,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
}

beforeEach(() => {
  useWorkflowStore.setState({
    workflows: [],
    selectedId: null,
    detail: null,
    wsStatus: 'closed',
    error: null,
  })
})

describe('workflow store', () => {
  it('upserts workflow events into the list', () => {
    useWorkflowStore.getState().applyServerEvent({ type: 'workflow.created', workflow })
    expect(useWorkflowStore.getState().workflows).toHaveLength(1)

    useWorkflowStore
      .getState()
      .applyServerEvent({ type: 'workflow.updated', workflow: { ...workflow, status: 'executing' } })
    expect(useWorkflowStore.getState().workflows[0].status).toBe('executing')
  })

  it('updates steps and artifacts of the selected workflow', () => {
    useWorkflowStore.setState({
      selectedId: 'wf-1',
      detail: { workflow, steps: [], artifacts: [], decisions: [] },
    })
    useWorkflowStore.getState().applyServerEvent({ type: 'step.updated', step })
    expect(useWorkflowStore.getState().detail?.steps).toContainEqual(step)

    useWorkflowStore.getState().applyServerEvent({ type: 'artifact.updated', artifact })
    expect(useWorkflowStore.getState().detail?.artifacts).toContainEqual(artifact)
  })

  it('sends a modify decision with the feedback note', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/workflows') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ workflow, steps: [], artifacts: [], decisions: [] }),
      })
    })
    useWorkflowStore.setState({
      selectedId: 'wf-1',
      detail: { workflow, steps: [], artifacts: [], decisions: [] },
    })

    await useWorkflowStore.getState().decide('wf-1', 's1', 'modify', '补充上下文工程方向')

    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes('/decision'))
    expect(call).toBeTruthy()
    expect(JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      type: 'modify',
      note: '补充上下文工程方向',
    })
  })
})
