import { describe, expect, it } from 'vitest'
import { createDb, createRepositories } from '@research-workbench/data'
import type { Repositories } from '@research-workbench/data'
import { createEventBus } from '../src/engine/eventBus'
import type { StepRunInput, StepRunResult, StepRunner } from '../src/engine/StepRunner'
import { WorkflowEngine } from '../src/engine/WorkflowEngine'

const LOW_SCORES = [
  '## 六维完整评分（规则口径，0-5）',
  '| 维度 | 评分 | 说明 |',
  '|------|------|------|',
  '| 主题匹配 | 3.2 | 泛化证据多 |',
  '| 完整性 | 2 | 框架实践对比无证据落地 |',
  '| 综合 | 2.9 | 六维平均 |',
].join('\n')

const HIGH_SCORES = [
  '## 六维完整评分（规则口径，0-5）',
  '| 维度 | 评分 | 说明 |',
  '|------|------|------|',
  '| 主题匹配 | 4 | 良好 |',
  '| 完整性 | 4 | 章节均有支撑 |',
  '| 综合 | 3.8 | 六维平均 |',
].join('\n')

const STEPS = [
  { label: '生成检索计划', role: 'planner' as const, requiresApproval: false },
  { label: '检索文献', role: 'researcher' as const, requiresApproval: false },
  { label: '筛选证据', role: 'selector' as const, requiresApproval: false },
  { label: '撰写综述', role: 'writer' as const, requiresApproval: false },
  { label: '评估证据', role: 'evaluator' as const, requiresApproval: false },
  { label: '审查引用', role: 'reviewer' as const, requiresApproval: false },
  { label: '归纳整理', role: 'summarizer' as const, requiresApproval: false },
]

/** evaluator 按序列逐次落 evaluation-scores（第 n 次评估取 scoresSeq[n-1]），模拟规则口径 */
function scoringRunner(repos: Repositories, runs: string[], scoresSeq: string[]): StepRunner {
  return {
    async run({ step }: StepRunInput): Promise<StepRunResult> {
      runs.push(step.role)
      if (step.role === 'evaluator') {
        const pass = repos.artifacts
          .listByWorkflow(step.workflowId)
          .filter((a) => a.name === 'evaluation-scores.md').length
        repos.artifacts.create({
          workflowId: step.workflowId,
          stepId: step.id,
          name: 'evaluation-scores.md',
          content: scoresSeq[Math.min(pass, scoresSeq.length - 1)],
        })
      }
      const nth = runs.filter((r) => r === step.role).length
      return { artifactName: `${step.role}.md`, content: `${step.role} 产出（第 ${nth} 次，内容互不相同）` }
    },
  }
}

function setup(scoresSeq: string[]) {
  const repos: Repositories = createRepositories(createDb())
  const bus = createEventBus()
  const runs: string[] = []
  const engine = new WorkflowEngine(repos, scoringRunner(repos, runs, scoresSeq), bus)
  return { repos, engine, runs }
}

describe('评估迭代回环（B 组）', () => {
  it('低分触发自动重写一轮并收敛', async () => {
    const { repos, engine, runs } = setup([LOW_SCORES, HIGH_SCORES])
    const wf = engine.createWorkflow({ goal: '调研', steps: STEPS })
    await engine.start(wf.id)

    const detail = engine.getDetail(wf.id)
    expect(detail.workflow.status).toBe('completed')
    expect(runs.filter((r) => r === 'writer')).toHaveLength(2)
    const scores = repos.artifacts.listByWorkflow(wf.id).filter((a) => a.name === 'evaluation-scores.md')
    expect(scores).toHaveLength(2)
    const loop = repos.artifacts.listByWorkflow(wf.id).filter((a) => a.name === 'evaluation-loop.md')
    expect(loop).toHaveLength(2)
    expect(loop[0].content).toContain('评估回环触发')
    expect(loop.at(-1)!.content).toContain('已收敛')
    // 全部步骤 approved（重置后二轮走完）
    expect(detail.steps.every((s) => s.status === 'approved')).toBe(true)
  })

  it('达标则不触发回环', async () => {
    const { repos, engine, runs } = setup([HIGH_SCORES])
    const wf = engine.createWorkflow({ goal: '调研', steps: STEPS })
    await engine.start(wf.id)

    expect(runs.filter((r) => r === 'writer')).toHaveLength(1)
    const loop = repos.artifacts.listByWorkflow(wf.id).filter((a) => a.name === 'evaluation-loop.md')
    expect(loop).toHaveLength(0)
  })

  it('二评仍低时如实标注未收敛并正常完成（上限 1 轮）', async () => {
    const { repos, engine, runs } = setup([LOW_SCORES, LOW_SCORES])
    const wf = engine.createWorkflow({ goal: '调研', steps: STEPS })
    await engine.start(wf.id)

    const detail = engine.getDetail(wf.id)
    expect(detail.workflow.status).toBe('completed')
    expect(runs.filter((r) => r === 'writer')).toHaveLength(2)
    expect(runs.filter((r) => r === 'evaluator')).toHaveLength(2)
    const loop = repos.artifacts.listByWorkflow(wf.id).filter((a) => a.name === 'evaluation-loop.md')
    expect(loop.at(-1)!.content).toContain('仍未收敛')
  })
})
