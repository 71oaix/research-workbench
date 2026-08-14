import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createDb } from '@research-workbench/data'
import { wsRoutes } from './ws'

export function createApp(db: ReturnType<typeof createDb> = createDb()) {
  const app = new Hono()

  app.get('/health', (c) => {
    try {
      db.prepare('SELECT 1').get()
      return c.json({ status: 'ok', db: 'ok' })
    } catch {
      return c.json({ status: 'error', db: 'error' }, 503)
    }
  })

  app.route('/', wsRoutes)
  return app
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000)
  const db = createDb(process.env.DB_PATH ?? 'data/app.db')
  const app = createApp(db)
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`)
  })
}
