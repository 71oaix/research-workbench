import { describe, expect, it } from 'vitest'
import { buildRerankMd, parseRerankReport } from '../../src/search/rerank'

describe('parseRerankReport', () => {
  it('parses a sorted pipe table and sorts descending', () => {
    const md = [
      '## 相关度排序',
      '',
      '| 编号 | 分数 | 理由 |',
      '|------|------|------|',
      '| [3] | 88 | 直接命中核心',
      '| [1] | 91 | 最贴合问题',
      '| [5] | 54 | 相关但侧面',
    ].join('\n')
    const entries = parseRerankReport(md)
    expect(entries.map((entry) => entry.id)).toEqual([1, 3, 5])
    expect(entries[0].score).toBe(91)
    expect(entries[1].reason).toContain('核心')
  })

  it('tolerates format drift and skips malformed rows', () => {
    const md = [
      '## 相关度排序',
      '- 2: 76 泛化到多实体',
      'not a row',
      '- 4: 55 补充',
    ].join('\n')
    const entries = parseRerankReport(md)
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe(2)
  })

  it('returns empty when no ranking section is present', () => {
    expect(parseRerankReport('### [1] 判定：入选\n- 相关度：高')).toEqual([])
  })
})

describe('buildRerankMd', () => {
  it('builds a markdown table with a header note', () => {
    const md = buildRerankMd([
      { id: 1, score: 90, reason: '最贴合' },
      { id: 2, score: 60, reason: '侧面' },
    ])
    expect(md).toContain('# 相关度排序')
    expect(md).toContain('| [1] | 90 | 最贴合 |')
    expect(md).toContain('| [2] | 60 | 侧面 |')
  })

  it('falls back when there are no entries', () => {
    expect(buildRerankMd([])).toContain('未解析到模型精排输出')
  })
})
