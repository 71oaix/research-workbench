import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVerificationTable } from '../src/lib/citations'
import { MarkdownView } from '../src/components/MarkdownView'

afterEach(cleanup)

describe('parseVerificationTable', () => {
  it('parses the 5-column verification table with status mapping', () => {
    const md = [
      '| 编号 | 状态 | 级别 | 置信度 | 摘要 |',
      '|------|------|------|--------|------|',
      '| [2] | verified | info | 0.95 | 一致 |',
      '| [5] | check_suggested | warning | 0.6 | 待复核 |',
      '| [7] | needs_fix | critical | 0.2 | 元数据不符 |',
      '| [V1-3]（归一化为 [3]） | unverifiable | warning | — | 源不可达 |',
      '| 备注 | 本行无编号 | — | — | — |',
    ].join('\n')
    const meta = parseVerificationTable(md)
    expect(meta.get(2)?.status).toBe('verified')
    expect(meta.get(2)?.confidence).toBe('0.95')
    expect(meta.get(5)?.status).toBe('warn')
    expect(meta.get(7)?.status).toBe('bad')
    expect(meta.get(3)?.status).toBe('unknown')
    expect(meta.size).toBe(4)
  })

  it('keeps the strongest status when an id appears twice', () => {
    const md = '| [4] | verified | info | 0.9 | ok |\n| [4] | needs_fix | critical | 0.1 | bad |'
    expect(parseVerificationTable(md).get(4)?.status).toBe('bad')
  })
})

describe('MarkdownView citations', () => {
  const meta = new Map([[2, { title: '记忆分层研究', year: '2021', status: 'verified' as const, confidence: '0.95' }]])

  it('renders interactive cite marks only when citations are provided', () => {
    const { container, rerender } = render(<MarkdownView content={'文中引用 [2] 与 [99]。'} />)
    expect(container.querySelector('.cite-mark')).toBeNull()
    expect(screen.getByText(/\[2\]/)).toBeTruthy()

    rerender(<MarkdownView content={'文中引用 [2] 与 [99]。'} citations={meta} />)
    const marks = container.querySelectorAll<HTMLElement>('.cite-mark')
    expect(marks.length).toBe(2)
    expect(marks[0]?.getAttribute('data-cite')).toBe('2')
    expect(marks[0]?.getAttribute('data-status')).toBe('verified')
    expect(marks[0]?.textContent).toContain('[2]')
    expect(marks[0]?.querySelector('.cite-tip')?.textContent).toContain('记忆分层研究')
    expect(marks[1]?.getAttribute('data-status')).toBe('unknown')
  })

  it('emits click callback with the cited id and skips code regions', () => {
    const onCiteClick = vi.fn()
    const { container } = render(
      <MarkdownView
        content={'引用 [2]，但代码里 `arr[2]` 保持字面。\n\n```\nmatrix[2]\n```'}
        citations={meta}
        onCiteClick={onCiteClick}
      />
    )
    const sups = container.querySelectorAll('.cite-mark')
    expect(sups.length).toBe(1)
    fireEvent.click(sups[0]!)
    expect(onCiteClick).toHaveBeenCalledWith(2)
    expect(container.querySelector('code .cite-mark')).toBeNull()
  })

  it('escapes hostile citation-adjacent content', () => {
    const { container } = render(
      <MarkdownView content={'[2]<script>alert(1)</script>'} citations={meta} />
    )
    expect(container.querySelector('script')).toBeNull()
  })
})
