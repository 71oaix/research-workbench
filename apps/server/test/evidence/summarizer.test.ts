import { describe, expect, it } from 'vitest'
import {
  buildBibtex,
  buildTopicGroups,
  parseSummaryCards,
} from '../../src/evidence/summarizer'

const CARDS = [
  '# cards',
  '',
  '### [1] Multi-Agent Shared Memory',
  '- 年份：2024 | 引用数：10 | 来源：openalex | 相关度：高',
  '- 作者：Alice',
  '- DOI：10.1/a',
  '- 摘要：multi-agent shared memory architecture',
  '',
  '### [2] RAG for Scientific Writing',
  '- 年份：2023 | 引用数：5 | 来源：crossref | 相关度：部分',
  '- 作者：Bob',
  '- DOI：10.1/b',
  '- 摘要：retrieval augmented generation survey',
  '',
  '### [3] Unrelated Paper',
  '- 年份：2022 | 引用数：1 | 来源：arxiv',
  '- 作者：Cara',
  '- arXiv：2201.00001',
  '- 摘要：something else entirely',
].join('\n')

describe('summarizer', () => {
  it('parses cards with relevance levels and identifiers', () => {
    const cards = parseSummaryCards(CARDS)
    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({ id: 1, level: 'high', doi: '10.1/a' })
    expect(cards[1]).toMatchObject({ id: 2, level: 'partial', doi: '10.1/b' })
    expect(cards[2]).toMatchObject({ id: 3, level: null, arxivId: '2201.00001' })
  })

  it('groups cards by plan concepts with primary and related, unmatched into 其他', () => {
    const plan = [
      '## 检索关键词',
      '- 多智能体共享记忆 / multi-agent shared memory',
      '- 检索增强生成 / retrieval augmented generation',
    ].join('\n')
    const groups = buildTopicGroups(parseSummaryCards(CARDS), plan)
    const concepts = groups.map((group) => group.concept)
    expect(concepts).toContain('多智能体共享记忆 / multi-agent shared memory')
    expect(concepts).toContain('检索增强生成 / retrieval augmented generation')
    expect(concepts).toContain('其他')
    const memory = groups.find(
      (group) => group.concept === '多智能体共享记忆 / multi-agent shared memory'
    )
    expect(memory?.primary).toContain(1)
    const rag = groups.find(
      (group) => group.concept === '检索增强生成 / retrieval augmented generation'
    )
    expect(rag?.primary).toContain(2)
    const other = groups.find((group) => group.concept === '其他')
    expect(other?.primary).toContain(3)
  })

  it('builds bibtex with only available fields', () => {
    const bib = buildBibtex(parseSummaryCards(CARDS))
    expect(bib).toContain('@article{research1')
    expect(bib).toContain('doi = {10.1/a}')
    expect(bib).not.toContain('volume')
  })
})
