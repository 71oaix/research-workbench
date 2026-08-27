import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownView } from '../src/components/MarkdownView'

afterEach(cleanup)

describe('MarkdownView', () => {
  it('renders headings, bold, lists and code blocks', () => {
    render(
      <MarkdownView
        content={'# Title\n\n**bold** text\n\n- item one\n- item two\n\n```js\nconst x = 1\n```'}
      />
    )
    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText(/bold/)).toBeTruthy()
    expect(screen.getByText('item one')).toBeTruthy()
    const code = document.querySelector('pre code')
    expect(code?.textContent).toContain('const x = 1')
  })

  it('escapes raw HTML to avoid XSS', () => {
    render(<MarkdownView content={'<script>alert(1)</script>\n\n**ok**'} />)
    expect(document.querySelector('script')).toBeNull()
    const html = document.body.innerHTML
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(screen.getByText(/ok/)).toBeTruthy()
  })

  it('renders thematic breaks, ordered lists and scoped table wrapper', () => {
    render(
      <MarkdownView
        content={'---\n\n1. 第一\n2. 第二\n\n| A | B |\n|---|---|\n| 1 | 2 |'}
      />
    )
    expect(document.querySelector('hr')).not.toBeNull()
    expect(document.querySelector('ol li')).not.toBeNull()
    expect(screen.getByText('第一')).toBeTruthy()
    expect(document.querySelector('.md-table-wrap table th')).not.toBeNull()
    expect(document.querySelectorAll('tbody td').length).toBe(2)
  })

  it('applies doc mode class for draft rendering', () => {
    const { container } = render(<MarkdownView content={'# 标题'} doc />)
    expect(container.firstElementChild?.classList.contains('md-doc')).toBe(true)
  })
})
