import { describe, expect, it } from 'vitest'
import { SearchError } from '../../src/search/errors'
import {
  expandKeywordQueries,
  expandSynonyms,
  extractKeywordGroups,
  normalizeArxivQuery,
  parseTimeRange,
} from '../../src/search/keywords'

describe('extractKeywordGroups', () => {
  it('parses keyword groups from the plan, stripping markdown and numbering', () => {
    const plan = [
      '# 检索计划',
      '',
      '## 研究问题',
      '研究大模型测试',
      '',
      '## 检索关键词',
      '- **LLM 测试**：agent 评测',
      '- 2. RAG',
      '- 3. 大模型幻觉',
      '- 4. 基准测试',
      '',
      '## 综述大纲',
      '- 引言',
    ].join('\n')

    const groups = extractKeywordGroups(plan)
    expect(groups).toHaveLength(4)
    expect(groups[0].query).toBe('LLM 测试：agent 评测')
    expect(groups[1].query).toBe('RAG')
    expect(groups[2].query).toBe('大模型幻觉')
    expect(groups[3].query).toBe('基准测试')
  })

  it('falls back to sub-questions when no keyword section exists', () => {
    const plan = ['# 计划', '', '## 子问题', '- 智能体如何规划任务？', '- 如何防止上下文污染？'].join(
      '\n'
    )
    const groups = extractKeywordGroups(plan)
    expect(groups.map((g) => g.query)).toEqual([
      '智能体如何规划任务？',
      '如何防止上下文污染？',
    ])
  })

  it('merges keyword groups and sub-questions (RefChain), deduping and capping', () => {
    const plan = [
      '## 子问题',
      '- 多智能体的记忆如何组织？',
      '- 记忆如何影响规划？',
      '',
      '## 检索关键词',
      '- multi-agent memory',
      '- 多智能体的记忆如何组织？',
    ].join('\n')
    const groups = extractKeywordGroups(plan, 10)
    expect(groups.map((g) => g.query)).toEqual([
      'multi-agent memory',
      '多智能体的记忆如何组织？',
      '记忆如何影响规划？',
    ])
  })

  it('deduplicates identical queries and caps at maxGroups', () => {
    const plan = ['## 检索关键词', '- RAG', '- RAG', '- 幻觉', '- 检索'].join('\n')
    expect(extractKeywordGroups(plan, 2).map((g) => g.query)).toEqual(['RAG', '幻觉'])
  })

  it('throws a clear error when nothing parseable exists', () => {
    expect(() => extractKeywordGroups('# 空计划')).toThrow(SearchError)
  })

  it('expands slash-separated bilingual keywords into separate queries', () => {
    const expanded = expandKeywordQueries([
      { label: 'g1', query: '多智能体 记忆架构 / multi-agent memory architecture' },
      { label: 'g2', query: 'RAG' },
    ])
    expect(expanded).toEqual([
      { label: 'g1-1', query: '多智能体 记忆架构' },
      { label: 'g1-2', query: 'multi-agent memory architecture' },
      { label: 'g2', query: 'RAG' },
      { label: 'g2-syn1', query: 'retrieval augmented generation' },
    ])
  })

  it('expands known abbreviations deterministically, capped at 2 per group', () => {
    expect(expandSynonyms('LLM and RAG')).toEqual([
      'large language model',
      'retrieval augmented generation',
    ])
    expect(expandSynonyms('普通查询')).toEqual([])
    expect(expandSynonyms('RLHF + RL')).toContain('reinforcement learning')
    const expanded = expandKeywordQueries([{ label: 'g1', query: 'LLM RAG NLP' }])
    const synonymLabels = expanded
      .filter((group) => group.label.includes('syn'))
      .map((group) => group.query)
    expect(synonymLabels).toHaveLength(2)
  })

  it('parses explicit year ranges, recent years and safe fallbacks', () => {
    expect(parseTimeRange('时间范围：2020-2025')).toEqual({ yearFrom: 2020, yearTo: 2025 })
    expect(parseTimeRange('近5年')).toEqual({ yearFrom: new Date().getFullYear() - 5 })
    expect(parseTimeRange('2021 年以来的工作')).toEqual({ yearFrom: 2021 })
    expect(parseTimeRange('无时间要求')).toBeNull()
  })

  it('normalizes long arxiv queries to at most 3 content words', () => {
    expect(normalizeArxivQuery('episodic semantic memory LLM agent')).toBe(
      'episodic semantic memory'
    )
    expect(normalizeArxivQuery('multi-agent memory architecture')).toBe(
      'multi-agent memory architecture'
    )
  })

  it('skips queries without english content for arxiv', () => {
    expect(normalizeArxivQuery('多智能体 记忆架构')).toBeNull()
    expect(normalizeArxivQuery('shared memory multi-agent')).toBe(
      'shared memory multi-agent'
    )
  })
})
