import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Artifact } from '@research-workbench/shared'
import { ArtifactTabs } from '../src/components/ArtifactTabs'

function artifact(name: string, version: number, content: string): Artifact {
  return {
    id: `${name}-${version}`,
    workflowId: 'wf-1',
    stepId: null,
    name,
    content,
    version,
    createdAt: `2026-08-16T00:00:0${version}.000Z`,
    updatedAt: `2026-08-16T00:00:0${version}.000Z`,
  }
}

afterEach(cleanup)

describe('ArtifactTabs', () => {
  it('groups artifacts and shows descriptions', async () => {
    render(
      <ArtifactTabs
        artifacts={[artifact('01-plan.md', 1, '# 计划'), artifact('03-draft.md', 1, '# 草稿')]}
      />
    )
    expect(screen.getByText('规划')).toBeTruthy()
    expect(screen.getByText('检索计划')).toBeTruthy()
    expect(screen.getByText('综述初稿')).toBeTruthy()
    fireEvent.click(screen.getByText('检索计划'))
    expect(await screen.findByText(/Planner 生成/)).toBeTruthy()
  })

  it('shows structure diff between two draft versions', async () => {
    render(
      <ArtifactTabs
        artifacts={[
          artifact('03-draft.md', 1, '## 旧章节\n引用 [1]'),
          artifact('03-draft.md', 2, '## 新章节\n引用 [1][2]'),
        ]}
      />
    )
    fireEvent.click(screen.getByText('对比上一版'))
    expect(await screen.findByText(/移除章节：旧章节/)).toBeTruthy()
    expect(screen.getByText(/新增章节：新章节/)).toBeTruthy()
    expect(screen.getByText(/新增引用的编号：2/)).toBeTruthy()
  })
})
