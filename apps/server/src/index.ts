import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { createDb, createRepositories } from '@research-workbench/data'
import type { Role, StepSpec } from '@research-workbench/shared'
import { createEventBus } from './engine/eventBus'
import { EngineError, WorkflowEngine } from './engine/WorkflowEngine'
import { FakeStepRunner } from './engine/StepRunner'
import type { StepRunner } from './engine/StepRunner'
import { PiRuntimeProvider } from './runtime/PiRuntimeProvider'
import { PiStepRunner } from './runtime/PiStepRunner'
import { PiConfigError, loadPiConfig } from './runtime/piConfig'
import { wsRoutes } from './ws'

const ROLES: Role[] = ['planner', 'researcher', 'writer', 'reviewer']

export function createApp(
  db: ReturnType<typeof createDb> = createDb(),
  stepRunner?: StepRunner
) {
  const repos = createRepositories(db)
  const bus = createEventBus()
  const runner = stepRunner ?? createDefaultStepRunner(repos, bus)
  const engine = new WorkflowEngine(repos, runner, bus)
  const app = new Hono()

  app.get('/health', (c) => {
    try {
      db.prepare('SELECT 1').get()
      return c.json({ status: 'ok', db: 'ok' })
    } catch {
      return c.json({ status: 'error', db: 'error' }, 503)
    }
  })

  app.post('/workflows', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (
      !body ||
      typeof body.goal !== 'string' ||
      !Array.isArray(body.steps) ||
      body.steps.length === 0
    ) {
      return c.json({ error: 'invalid_body' }, 400)
    }
    const steps: StepSpec[] = []
    for (const raw of body.steps as Record<string, unknown>[]) {
      const label = typeof raw.label === 'string' ? raw.label.trim() : ''
      const role = typeof raw.role === 'string' ? (raw.role as Role) : null
      if (!label || !role || !ROLES.includes(role)) {
        return c.json({ error: 'invalid_step' }, 400)
      }
      steps.push({ label, role, requiresApproval: raw.requiresApproval === true })
    }
    const workflow = engine.createWorkflow({ goal: body.goal, steps })
    return c.json(engine.getDetail(workflow.id), 201)
  })

  app.post('/workflows/:id/start', async (c) => {
    try {
      const workflow = await engine.start(c.req.param('id'))
      return c.json(engine.getDetail(workflow.id))
    } catch (e) {
      return handleError(c, e)
    }
  })

  app.get('/workflows/:id', (c) => {
    try {
      return c.json(engine.getDetail(c.req.param('id')))
    } catch (e) {
      return handleError(c, e)
    }
  })

  app.post('/workflows/:id/steps/:stepId/decision', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || (body.type !== 'approve' && body.type !== 'reject')) {
      return c.json({ error: 'invalid_decision' }, 400)
    }
    try {
      const workflow = await engine.decide(
        c.req.param('id'),
        c.req.param('stepId'),
        body.type,
        typeof body.note === 'string' ? body.note : null
      )
      return c.json(engine.getDetail(workflow.id))
    } catch (e) {
      return handleError(c, e)
    }
  })

  app.route('/', wsRoutes)
  return app
}

function createDefaultStepRunner(
  repos: ReturnType<typeof createRepositories>,
  bus: ReturnType<typeof createEventBus>
): StepRunner {
  const config = loadPiConfig()
  const provider = new PiRuntimeProvider(config)
  return new PiStepRunner(provider, (usage) => {
    const record = repos.usage.record(usage)
    bus.emit({ type: 'usage.recorded', usage: record })
  })
}

function handleError(c: Context, e: unknown) {
  if (e instanceof PiConfigError) {
    return c.json({ error: e.message }, 500)
  }
  if (e instanceof EngineError) {
    return c.json({ error: e.message }, e.status as 400 | 404 | 409 | 500 | 503)
  }
  console.error(e)
  return c.json({ error: 'internal_error' }, 500)
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000)
  const db = createDb(process.env.DB_PATH ?? 'data/app.db')
  const app = createApp(db)
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`)
  })
}
