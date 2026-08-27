import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { structureDiff, StructureDiff } from '../src/components/StructureDiff'

afterEach(cleanup)

describe('StructureDiff', () => {
  it('reports heading and reference changes between versions', () => {
    const prev = '## 旧章节\n\n引用 [1] 和 [3]\n\n### 子节'
    const next = '## 新章节\n\n引用 [2]'
    const diff = structureDiff(prev, next)
    expect(diff.removedHeads).toContain('旧章节')
    expect(diff.addedHeads).toContain('新章节')
    expect(diff.removedRefs).toEqual(['1', '3'])
    expect(diff.addedRefs).toEqual(['2'])
  })

  it('renders change lines and the no-change fallback', () => {
    render(<StructureDiff prev={'## A'} next={'## A\n## B'} />)
    expect(screen.getByText(/新增章节：B/)).toBeTruthy()
    cleanup()
    render(<StructureDiff prev={'## A\n[1]'} next={'## A\n[1]'} />)
    expect(screen.getByText('章节结构无变化')).toBeTruthy()
  })
})
