import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import type { StepRunner } from '../src/engine/StepRunner'
import { WorkflowEngine } from '../src/engine/WorkflowEngine'

describe('WorkflowEngine failure path', () => {
  it('marks workflow and step as failed when runner throws', async () => {
    const repos = createRepositories(createDb())
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((e) => events.push(e))
    const failingRunner: StepRunner = {
      async run() {
        throw new Error('boom')
      },
    }
    const engine = new WorkflowEngine(repos, failingRunner, bus)
    const workflow = engine.createWorkflow({
      goal: '调研',
      steps: [{ label: '生成计划', role: 'planner', requiresApproval: true }],
    })

    await expect(engine.start(workflow.id)).rejects.toThrow('boom')
    const detail = engine.getDetail(workflow.id)
    expect(detail.workflow.status).toBe('failed')
    expect(detail.steps[0].status).toBe('failed')
    expect(events.some((e) => e.type === 'workflow.updated')).toBe(true)
  })
})
