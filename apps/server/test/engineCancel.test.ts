import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import type { StepRunner } from '../src/engine/StepRunner'
import { WorkflowEngine } from '../src/engine/WorkflowEngine'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('WorkflowEngine cancel', () => {
  it('cancels a running workflow: running step skipped, no artifact saved, later steps skipped', async () => {
    const repos = createRepositories(createDb())
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((e) => events.push(e))

    // planner 卡住直到测试放行；artifact 落库后步骤需要审批（paused）
    const gate = deferred<void>()
    const runner: StepRunner = {
      async run({ step }) {
        if (step.role === 'planner') {
          await gate.promise
          return { artifactName: '01-plan.md', content: '# 半成品' }
        }
        return { artifactName: '02-research.md', content: '# 不应执行' }
      },
    }
    const engine = new WorkflowEngine(repos, runner, bus)
    const workflow = engine.createWorkflow({
      goal: '取消验证',
      steps: [
        { label: '生成计划', role: 'planner', requiresApproval: false },
        { label: '检索文献', role: 'researcher', requiresApproval: false },
      ],
    })

    const started = engine.start(workflow.id)
    await new Promise((r) => setTimeout(r, 30))
    const cancelled = await engine.cancel(workflow.id)
    gate.resolve()
    await started

    expect(cancelled.status).toBe('cancelled')
    const detail = engine.getDetail(workflow.id)
    expect(detail.workflow.status).toBe('cancelled')
    expect(detail.steps[0].status).toBe('skipped')
    expect(detail.steps[1].status).toBe('skipped')
    expect(detail.artifacts).toHaveLength(0)
    // 状态事件广播（WS 依赖）
    const lastUpdate = events.filter((e) => e.type === 'workflow.updated').at(-1)
    expect(lastUpdate && lastUpdate.type === 'workflow.updated' && lastUpdate.workflow.status).toBe('cancelled')
  })

  it('rejects cancel for non-executing workflows', async () => {
    const repos = createRepositories(createDb())
    const engine = new WorkflowEngine(repos, { async run() { throw new Error('nope') } }, createEventBus())
    const workflow = engine.createWorkflow({
      goal: '未启动',
      steps: [{ label: '生成计划', role: 'planner', requiresApproval: true }],
    })
    await expect(engine.cancel(workflow.id)).rejects.toThrow('workflow_not_executing')
  })
})
