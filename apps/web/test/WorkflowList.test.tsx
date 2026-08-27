import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Workflow } from '@research-workbench/shared'
import { useWorkflowStore } from '../src/store'
import { WorkflowList } from '../src/components/WorkflowList'

function makeWorkflow(id: string, goal: string, status: Workflow['status']): Workflow {
  return {
    id,
    goal,
    status,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
  }
}

const workflows = [
  makeWorkflow('wf-1', '研究多智能体记忆', 'completed'),
  makeWorkflow('wf-2', '大模型幻觉检测', 'paused'),
  makeWorkflow('wf-3', '多智能体协作评估', 'executing'),
  makeWorkflow('wf-4', 'RAG 检索优化', 'failed'),
]

beforeEach(() => {
  useWorkflowStore.setState({
    workflows,
    selectedId: null,
    detail: null,
    wsStatus: 'open',
    error: null,
  })
})

afterEach(cleanup)

describe('WorkflowList', () => {
  it('filters by keyword and status chips with counts', () => {
    render(<WorkflowList wsStatus="open" />)
    expect(screen.getAllByRole('listitem').length).toBe(4)
    const chip = (name: RegExp) => screen.getByRole('button', { name })
    expect(chip(/进行中 1$|进行中1/)).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('搜索工作流…'), { target: { value: '多智能体' } })
    expect(screen.getAllByRole('listitem').length).toBe(2)

    fireEvent.click(chip(/待审批/))
    expect(screen.queryByRole('button', { name: /研究多智能体记忆/ })).toBeNull()
    expect(screen.getByText(/无匹配结果/)).toBeTruthy()

    fireEvent.click(chip(/全部/))
    expect(screen.getAllByRole('listitem').length).toBe(2)
    fireEvent.change(screen.getByPlaceholderText('搜索工作流…'), { target: { value: '' } })
    expect(screen.getAllByRole('listitem').length).toBe(4)
  })

  it('hides uuid from entries and shows relative time + status word', () => {
    render(<WorkflowList wsStatus="open" />)
    expect(screen.queryByText(/wf-1/)).toBeNull()
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
  })

  it('shows onboarding CTA when the library is empty', () => {
    useWorkflowStore.setState({ workflows: [] })
    render(<WorkflowList wsStatus="open" />)
    expect(screen.getByText('还没有调研任务')).toBeTruthy()
    expect(screen.getByText('新建第一个调研 →')).toBeTruthy()
    expect(screen.queryByPlaceholderText('搜索工作流…')).toBeNull()
  })
})
