import { describe, expect, it } from 'vitest'
import { createApp } from '../src/index'

describe('workflow REST API', () => {
  it('creates, starts and completes a workflow via API', async () => {
    const app = createApp()

    const createRes = await app.request('/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: '调研 LLM 测试',
        steps: [
          { label: '生成计划', role: 'planner', requiresApproval: true },
          { label: '检索文献', role: 'researcher', requiresApproval: false },
        ],
      }),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as {
      workflow: { id: string }
      steps: { id: string; status: string; position: number }[]
    }
    expect(created.workflow.id).toBeTruthy()
    expect(created.steps.map((s) => s.position)).toEqual([0, 1])

    const startRes = await app.request(`/workflows/${created.workflow.id}/start`, {
      method: 'POST',
    })
    expect(startRes.status).toBe(200)
    const started = (await startRes.json()) as {
      workflow: { status: string }
      steps: { id: string; status: string; requiresApproval: boolean }[]
    }
    expect(started.workflow.status).toBe('paused')
    expect(started.steps[0].status).toBe('awaiting_approval')
    expect(started.steps[0].requiresApproval).toBe(true)

    const stepId = started.steps[0].id
    const approveRes = await app.request(
      `/workflows/${created.workflow.id}/steps/${stepId}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'approve', note: '计划可行' }),
      }
    )
    expect(approveRes.status).toBe(200)
    const approved = (await approveRes.json()) as {
      workflow: { status: string }
      steps: { status: string }[]
    }
    expect(approved.workflow.status).toBe('completed')
    expect(approved.steps.every((s) => s.status === 'approved')).toBe(true)
  })

  it('returns 400/404 for invalid input', async () => {
    const app = createApp()
    expect((await app.request('/workflows', { method: 'POST', body: '{}' })).status).toBe(400)
    expect((await app.request('/workflows/unknown')).status).toBe(404)
  })
})
