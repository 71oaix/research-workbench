import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { createDb } from '@research-workbench/data'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { FakeStepRunner } from '../src/engine/StepRunner'
import { createAppBundle } from '../src/index'
import { attachWebSocket } from '../src/ws'

describe('WebSocket event broadcast', () => {
  it('sends hello on connect and broadcasts workflow.created', async () => {
    const { app, bus } = createAppBundle(createDb(), new FakeStepRunner(1))
    const server = serve({ fetch: app.fetch, port: 0 })
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    attachWebSocket(bus, server as unknown as Server)

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    const messages: unknown[] = []
    socket.on('message', (data) => {
      messages.push(JSON.parse(String(data)))
    })
    await once(socket, 'open')

    const res = await app.request('/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: '调研',
        steps: [{ label: '规划', role: 'planner', requiresApproval: true }],
      }),
    })
    expect(res.status).toBe(201)

    await waitFor(
      () =>
        messages.some((m) => (m as { type: string }).type === 'hello') &&
        messages.some((m) => (m as { type: string }).type === 'workflow.created')
    )

    socket.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('waitFor timeout')
}
