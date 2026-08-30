import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Artifact, Step, UsageSummary, Workflow } from '@research-workbench/shared'
import { RunOverview } from '../src/components/RunOverview'

const workflow: Workflow = {
  id: 'wf-1',
  goal: '调研',
  status: 'completed',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:12:00.000Z',
}

function makeStep(id: string, role: Step['role'], status: Step['status']): Step {
  return {
    id,
    workflowId: 'wf-1',
    label: `${role} 步骤`,
    role,
    status,
    position: 0,
    requiresApproval: false,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:02:00.000Z',
  }
}

const steps: Step[] = [
  makeStep('s1', 'planner', 'approved'),
  makeStep('s2', 'researcher', 'approved'),
  makeStep('s3', 'selector', 'approved'),
]

const artifacts: Artifact[] = [
  {
    id: 'a1',
    workflowId: 'wf-1',
    stepId: 's1',
    name: '01-plan.md',
    content: '# 计划',
    version: 1,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  },
  {
    id: 'a2',
    workflowId: 'wf-1',
    stepId: 's3',
    name: 'research-cards.md',
    content: '### [1] 论文 A\n### [2] 论文 B\n### [3] 论文 C',
    version: 1,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  },
]

// 同角色 selector 多行（gap 回环），展示层需按 role 聚合；0 元角色不出行
const usageSummary: UsageSummary[] = [
  {
    workflowId: 'wf-1',
    stepId: 's1',
    role: 'planner',
    calls: 1,
    inputTokens: 1800,
    outputTokens: 900,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costCny: 0.05,
  },
  {
    workflowId: 'wf-1',
    stepId: 's3',
    role: 'selector',
    calls: 1,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costCny: 0.015,
  },
  {
    workflowId: 'wf-1',
    stepId: 's3',
    role: 'selector',
    calls: 1,
    inputTokens: 500,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costCny: 0.005,
  },
  {
    workflowId: 'wf-1',
    stepId: 's2',
    role: 'researcher',
    calls: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costCny: 0,
  },
]

afterEach(cleanup)

function renderOverview(props: Partial<Parameters<typeof RunOverview>[0]> = {}) {
  return render(
    <RunOverview
      workflow={workflow}
      steps={steps}
      artifacts={artifacts}
      decisions={[{ id: 'd1' }]}
      usageSummary={usageSummary}
      {...props}
    />
  )
}

describe('RunOverview', () => {
  it('shows current status line and elapsed time', () => {
    renderOverview()
    expect(screen.getByText('已完成')).toBeTruthy()
    // 终态耗时停在 updatedAt - createdAt = 12 分钟
    expect(screen.getByText('12 分 00 秒')).toBeTruthy()
  })

  it('renders ranked per-role cost bars without collapse toggle', () => {
    const { container } = renderOverview()
    // 总额 = 0.05 + 0.015 + 0.005
    expect(container.textContent).toContain('¥0.07')
    expect(container.textContent).toContain('3 次调用')
    // 条形行：非零金额角色 2 个（researcher 0 元不占行），按金额降序 planner 在前
    const bars = Array.from(container.querySelectorAll('[title*="次调用"]'))
    expect(bars).toHaveLength(2)
    const texts = bars.map((b) => b.getAttribute('title'))
    expect(texts[0]).toContain('规划')
    expect(texts[1]).toContain('筛选')
    // 无折叠按钮（条形图常显）
    expect(screen.queryByRole('button', { name: /按角色明细/ })).toBeNull()
  })

  it('counts paper assets from research cards and flags coverage matrix', () => {
    const { container } = renderOverview()
    expect(container.textContent).toContain('3 论文')
    expect(container.textContent).toContain('2 产物')
    expect(container.textContent).toContain('1 决策')
    expect(container.textContent).toContain('覆盖矩阵 —')
  })

  it('marks coverage matrix as ready and clickable when artifact exists', () => {
    const { container } = renderOverview({
      artifacts: [
        ...artifacts,
        {
          id: 'a3',
          workflowId: 'wf-1',
          stepId: 's3',
          name: 'coverage-matrix.md',
          content: '| 子问题 | 判定 |',
          version: 1,
          createdAt: '2026-08-31T00:00:00.000Z',
          updatedAt: '2026-08-31T00:00:00.000Z',
        },
      ],
    })
    expect(container.textContent).toContain('覆盖矩阵')
    expect(container.textContent).not.toContain('覆盖矩阵 —')
    expect(screen.getByRole('button', { name: /覆盖矩阵/ })).toBeTruthy()
  })

  it('shows awaiting-approval line when paused', () => {
    renderOverview({
      workflow: { ...workflow, status: 'paused' },
      steps: [makeStep('s1', 'planner', 'awaiting_approval')],
    })
    expect(screen.getByText('等待你的审批：planner 步骤')).toBeTruthy()
  })
})
