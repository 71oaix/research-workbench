import type { Server } from 'node:http'
import type { ServerEvent } from '@research-workbench/shared'
import { WebSocket, WebSocketServer } from 'ws'
import type { WorkflowEventBus } from './engine/eventBus'

export function attachWebSocket(
  bus: WorkflowEventBus,
  server: Server
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' })
  const unsubscribe = bus.on((event: ServerEvent) => {
    const payload = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    }
  })

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello' } satisfies ServerEvent))
  })
  wss.on('close', () => {
    unsubscribe()
  })
  return wss
}
