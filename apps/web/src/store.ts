import { create } from 'zustand'
import type { Artifact, ServerEvent, Workflow } from '@research-workbench/shared'
import { api } from './api'
import type { WorkflowDetail } from './api'

type WsStatus = 'connecting' | 'open' | 'closed'

interface WorkflowState {
  workflows: Workflow[]
  selectedId: string | null
  detail: WorkflowDetail | null
  wsStatus: WsStatus
  error: string | null
  refreshList: () => Promise<void>
  createWorkflow: (goal: string) => Promise<void>
  selectWorkflow: (id: string) => Promise<void>
  startWorkflow: () => Promise<void>
  decide: (stepId: string, type: 'approve' | 'modify' | 'reject', note?: string) => Promise<void>
  applyServerEvent: (event: ServerEvent) => void
  connectWs: () => () => void
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  selectedId: null,
  detail: null,
  wsStatus: 'closed',
  error: null,

  async refreshList() {
    try {
      const workflows = await api.listWorkflows()
      set({ workflows })
      const selectedId = get().selectedId
      if (selectedId) {
        const detail = await api.getWorkflow(selectedId)
        set({ detail })
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async createWorkflow(goal) {
    const trimmed = goal.trim()
    if (!trimmed) return
    try {
      const detail = await api.createWorkflow(trimmed)
      const workflows = await api.listWorkflows()
      set({ workflows, selectedId: detail.workflow.id, detail, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectWorkflow(id) {
    try {
      const detail = await api.getWorkflow(id)
      set({ selectedId: id, detail, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async startWorkflow() {
    const workflowId = get().selectedId
    if (!workflowId) return
    try {
      const detail = await api.startWorkflow(workflowId)
      const workflows = await api.listWorkflows()
      set({ detail, workflows, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async decide(stepId, type, note) {
    const workflowId = get().selectedId
    if (!workflowId) return
    try {
      const detail = await api.decide(workflowId, stepId, type, note)
      const workflows = await api.listWorkflows()
      set({ detail, workflows, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  applyServerEvent(event) {
    const state = get()
    const detail = state.detail
    switch (event.type) {
      case 'workflow.created':
      case 'workflow.updated': {
        set({ workflows: upsertWorkflow(state.workflows, event.workflow) })
        if (detail && detail.workflow.id === event.workflow.id) {
          set({ detail: { ...detail, workflow: event.workflow } })
        }
        break
      }
      case 'step.updated': {
        if (!detail || detail.workflow.id !== event.step.workflowId) break
        set({ detail: { ...detail, steps: upsertStep(detail.steps, event.step) } })
        break
      }
      case 'artifact.updated': {
        if (!detail || detail.workflow.id !== event.artifact.workflowId) break
        set({ detail: { ...detail, artifacts: upsertArtifact(detail.artifacts, event.artifact) } })
        break
      }
      case 'decision.created': {
        if (!detail || detail.workflow.id !== event.decision.workflowId) break
        const decisions = [
          ...detail.decisions.filter((decision) => decision.id !== event.decision.id),
          event.decision,
        ]
        set({ detail: { ...detail, decisions } })
        break
      }
      case 'search.completed':
      case 'usage.recorded':
      case 'paper.created':
      case 'hello':
      case 'error':
        break
    }
  },

  connectWs() {
    const url = `ws://${window.location.host}/ws`
    set({ wsStatus: 'connecting' })
    const socket = new WebSocket(url)
    let closed = false

    socket.onopen = () => set({ wsStatus: 'open', error: null })
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as ServerEvent
        get().applyServerEvent(event)
      } catch {
        /* ignore malformed frames */
      }
    }
    socket.onclose = () => {
      set({ wsStatus: 'closed' })
      if (!closed) {
        setTimeout(() => {
          if (!closed) get().connectWs()
        }, 3000)
      }
    }
    socket.onerror = () => socket.close()

    return () => {
      closed = true
      socket.close()
    }
  },
}))

function upsertWorkflow(list: Workflow[], workflow: Workflow): Workflow[] {
  const exists = list.some((item) => item.id === workflow.id)
  return exists
    ? list.map((item) => (item.id === workflow.id ? workflow : item))
    : [...list, workflow]
}

function upsertArtifact(list: Artifact[], artifact: Artifact): Artifact[] {
  const exists = list.some((item) => item.id === artifact.id)
  return exists
    ? list.map((item) => (item.id === artifact.id ? artifact : item))
    : [...list, artifact]
}

function upsertStep<T extends { id: string }>(list: T[], item: T): T[] {
  const exists = list.some((entry) => entry.id === item.id)
  return exists ? list.map((entry) => (entry.id === item.id ? item : entry)) : [...list, item]
}
