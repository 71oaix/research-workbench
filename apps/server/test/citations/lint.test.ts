import { describe, expect, it } from 'vitest'
import { buildCitationLint, extractCitationIds, extractCitationRefs } from '../../src/citations/lint'
import { extractCardIds } from '../../src/search/cards'

describe('extractCitationIds', () => {
  it('extracts all citation numbers in order of appearance', () => {
    expect(extractCitationIds('see [1] and [2], also [1] again')).toEqual([1, 2, 1])
  })

  it('ignores non-numeric and out-of-range markers', () => {
    expect(extractCitationIds('ref [abc], [0], [12345] and [7]')).toEqual([7])
  })

  it('returns an empty array for text without citations', () => {
    expect(extractCitationIds('no citations here')).toEqual([])
  })
})

describe('extractCitationRefs', () => {
  it('normalizes [V1-n] references to plain ids and marks them prefixed', () => {
    expect(extractCitationRefs('see [V1-1] and [2]')).toEqual([
      { id: 1, raw: '[V1-1]', kind: 'prefixed' },
      { id: 2, raw: '[2]', kind: 'plain' },
    ])
  })

  it('ignores invalid markers', () => {
    expect(extractCitationRefs('ref [abc], [0], [12345] and [7]')).toEqual([
      { id: 7, raw: '[7]', kind: 'plain' },
    ])
  })
})

describe('extractCardIds', () => {
  it('parses card ids from markdown headings', () => {
    const cards = ['# cards', '', '### [1] Paper A', '### [10] Paper B'].join('\n')
    expect(extractCardIds(cards)).toEqual([1, 10])
  })
})

describe('buildCitationLint', () => {
  it('reports valid and invalid citation ids with counts', () => {
    const lint = buildCitationLint('draft [1] and [2] and [99]', [1, 2, 3])
    expect(lint).toContain('草稿引用次数：3')
    expect(lint).toContain('有效引用编号：1, 2')
    expect(lint).toContain('越界 / 缺失编号：99')
    expect(lint).toContain('- [1]：1 次')
    expect(lint).toContain('存在 1 个不在卡片范围内的引用编号')
  })

  it('passes when all citations exist in the cards', () => {
    const lint = buildCitationLint('claim [1] and [2]', [1, 2])
    expect(lint).toContain('所有引用编号均在证据卡片范围内。')
  })

  it('flags a draft without any citations', () => {
    const lint = buildCitationLint('no citations', [1, 2])
    expect(lint).toContain('草稿中未发现 [编号] 引用')
  })

  it('reports a format hint for prefixed [V1-n] citations', () => {
    const lint = buildCitationLint('draft [V1-1] and [2]', [1, 2])
    expect(lint).toContain('检测到 [V1-n] 形式引用')
    expect(lint).toContain('有效引用编号：1, 2')
  })
})
