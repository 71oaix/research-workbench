import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaperCards } from '../src/components/PaperCards'

afterEach(cleanup)

const CARDS = [
  '# cards',
  '',
  '### [1] Multi-Agent Shared Memory',
  '- 年份：2024 | 引用数：10 | 相关度：高',
  '- DOI：10.1/a',
  '- 摘要：multi-agent shared memory architecture',
  '- 筛选理由：直接命中核心',
  '',
  '### [2] RAG Survey',
  '- 年份：2023 | 引用数：5 | 相关度：部分',
  '- 摘要：retrieval augmented generation survey',
].join('\n')

describe('PaperCards', () => {
  it('renders parsed paper cards with title, level, DOI and reason', () => {
    render(<PaperCards content={CARDS} />)
    expect(screen.getByText('Multi-Agent Shared Memory')).toBeTruthy()
    expect(screen.getByText('高')).toBeTruthy()
    expect(screen.getByText('10.1/a')).toBeTruthy()
    expect(screen.getByText(/直接命中核心/)).toBeTruthy()
    expect(screen.getByText('[2]')).toBeTruthy()
  })

  it('falls back to plain text when no card structure is present', () => {
    const { container } = render(<PaperCards content="no cards here" />)
    expect(container.textContent).toContain('no cards here')
  })
})
