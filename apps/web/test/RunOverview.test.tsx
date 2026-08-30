import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    updatedAt: '2026-08-31T00:00:00.000Z',
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

// 同角色 selector 多行（gap 回环），展示层需按 role 聚合
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
    costCny: 0.01,
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
    costCny: 0.01,
  },
]

afterEach(cleanup)

describe('RunOverview', () => {
  it('renders a machine node per step with aria labels', () => {
    const { container } = render(
      <RunOverview
        workflow={workflow}
        steps={steps}
        artifacts={artifacts}
        decisions={[]}
        usageSummary={usageSummary}
      />
    )
    expect(screen.getByRole('button', { name: 'planner 步骤，已通过' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'researcher 步骤，已通过' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'selector 步骤，已通过' })).toBeTruthy()
    expect(container.querySelectorAll('button[title]')).toHaveLength(3)
  })

  it('aggregates per-role cost across gap-loop rows', () => {
    const { container } = render(
      <RunOverview
        workflow={workflow}
        steps={steps}
        artifacts={artifacts}
        decisions={[]}
        usageSummary={usageSummary}
      />
    )
    // 总额 = 0.05 + 0.01 + 0.01；调用 1 + 1 + 1
    expect(container.textContent).toContain('¥0.07')
    expect(container.textContent).toContain('3 次调用')

    fireEvent.click(screen.getByRole('button', { name: /按角色明细/ }))
    // selector 两行聚合为一行：¥0.02 · 2 次
    expect(container.textContent).toContain('¥0.02 · 2 次')
    expect(container.textContent).toContain('¥0.05 · 1 次')
  })

  it('counts paper assets from research cards and flags coverage matrix', () => {
    const { container } = render(
      <RunOverview
        workflow={workflow}
        steps={steps}
        artifacts={artifacts}
        decisions={[{ id: 'd1' }]}
        usageSummary={usageSummary}
      />
    )
    expect(container.textContent).toContain('论文 3')
    expect(container.textContent).toContain('产物 2')
    expect(container.textContent).toContain('决策 1')
    expect(container.textContent).toContain('覆盖矩阵 —')
  })

  it('shows awaiting-approval line when paused', () => {
    render(
      <RunOverview
        workflow={{ ...workflow, status: 'paused' }}
        steps={[makeStep('s1', 'planner', 'awaiting_approval')]}
        artifacts={[]}
        decisions={[]}
        usageSummary={[]}
      />
    )
    expect(screen.getByText('等待你的审批：planner 步骤')).toBeTruthy()
  })
})
