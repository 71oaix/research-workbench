import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Step, Workflow } from '@research-workbench/shared'
import App from '../src/App'
import type { WorkflowDetail } from '../src/api'
import { useWorkflowStore } from '../src/store'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  close() {}
}

const workflow: Workflow = {
  id: 'wf-1',
  goal: '调研大模型测试',
  status: 'planning',
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
}

const steps: Step[] = [
  {
    id: 's1',
    workflowId: 'wf-1',
    label: '生成检索计划',
    role: 'planner',
    status: 'pending',
    position: 0,
    requiresApproval: true,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  } as Step,
  {
    id: 's2',
    workflowId: 'wf-1',
    label: '检索文献',
    role: 'researcher',
    status: 'pending',
    position: 1,
    requiresApproval: false,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  } as Step,
]

const detail: WorkflowDetail = { workflow, steps, artifacts: [], decisions: [] }
let currentDetail: WorkflowDetail = detail

beforeEach(() => {
  useWorkflowStore.setState({
    workflows: [],
    selectedId: null,
    detail: null,
    wsStatus: 'closed',
    error: null,
  })
  currentDetail = detail
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/workflows') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({ ok: true, json: async () => [workflow] })
      }
      if (url.endsWith('/api/workflows/wf-1/start')) {
        return Promise.resolve({ ok: true, json: async () => currentDetail })
      }
      if (url.endsWith('/api/workflows/wf-1')) {
        return Promise.resolve({ ok: true, json: async () => currentDetail })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
  )
})

afterEach(() => {
  cleanup()
})

describe('App workflow UI', () => {
  it('renders the workflow list and shows detail after selection', async () => {
    render(<App />)
    const item = await screen.findByText('调研大模型测试')
    item.click()
    expect(await screen.findByText(/状态：planning/)).toBeTruthy()
    expect(screen.getByText('启动工作流')).toBeTruthy()
  })

  it('calls the start API when the start button is clicked', async () => {
    render(<App />)
    const item = await screen.findByText('调研大模型测试')
    item.click()
    const startButton = await screen.findByText('启动工作流')
    startButton.click()
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((call) => String(call[0]).includes('/start'))).toBe(true)
    })
  })

  it('shows modify and cancel actions with decision history when a step awaits approval', async () => {
    currentDetail = {
      workflow,
      steps: [{ ...steps[0], status: 'awaiting_approval' }, steps[1]],
      artifacts: [],
      decisions: [
        {
          id: 'd1',
          workflowId: 'wf-1',
          stepId: 's1',
          type: 'modify',
          note: '补充上下文工程方向',
          createdAt: '2026-08-15T00:00:00.000Z',
        },
      ],
    }
    render(<App />)
    const item = await screen.findByText('调研大模型测试')
    item.click()
    expect(await screen.findByText('打回修改')).toBeTruthy()
    expect(screen.getByText('取消任务')).toBeTruthy()
    expect(screen.getByText('补充上下文工程方向')).toBeTruthy()
  })
})
