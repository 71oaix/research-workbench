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
})
