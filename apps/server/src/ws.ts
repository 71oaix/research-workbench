import { Hono } from 'hono'

export const wsRoutes = new Hono()

// M1 占位：协议类型已在 packages/shared 定义，真实 WS 通道在 M2 接入。
wsRoutes.get('/ws', (c) =>
  c.json({ error: 'websocket_not_ready', message: 'WS 通道将在 M2 接入' }, 426)
)
