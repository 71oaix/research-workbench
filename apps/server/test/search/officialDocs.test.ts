import { describe, expect, it } from 'vitest'
import {
  extractTextFromHtml,
  renderOfficialDocsSection,
  renderTitlesOnlySection,
  type DocRef,
} from '../../src/search/officialDocs'

describe('officialDocs', () => {
  it('extracts main content and strips boilerplate', () => {
    const html = [
      '<html><head>',
      '<script>var tracker = 1;</script>',
      '<style>.x { color: red }</style>',
      '</head><body>',
      '<nav>首页 · 文档 · 博客</nav>',
      '<main><h1>Memory</h1><p>Mem0 提供分层记忆管理 API，支持会话级记忆检索。</p></main>',
      '<footer>© 2026</footer>',
      '</body></html>',
    ].join('')
    const text = extractTextFromHtml(html)
    expect(text).toContain('Mem0 提供分层记忆管理 API')
    expect(text).toContain('Memory')
    expect(text).not.toContain('tracker')
    expect(text).not.toContain('首页 · 文档')
    expect(text).not.toContain('© 2026')
  })

  it('renders doc refs with source attribution and access date', () => {
    const docs = new Map<number, DocRef[]>([
      [
        3,
        [
          {
            title: 'Memory',
            url: 'https://docs.mem0.ai/memory',
            site: 'Mem0 官方文档',
            excerpt: '分层记忆管理 API…',
          },
        ],
      ],
    ])
    const md = renderOfficialDocsSection(docs)
    expect(md).toContain('官方文档参考')
    expect(md).toContain('不进引用编号与核验序列')
    expect(md).toContain('来源：Mem0 官方文档')
    expect(md).toContain('https://docs.mem0.ai/memory')
    expect(md).toContain('访问）')
    expect(md).toContain('子问题 3')
  })

  it('renders titles-only section for unqualified candidates', () => {
    const md = renderTitlesOnlySection([{ title: 'Paper X', reason: '无摘要且全文未获取' }])
    expect(md).toContain('仅题录')
    expect(md).toContain('未入证据池')
    expect(md).toContain('Paper X（无摘要且全文未获取）')
  })
})
