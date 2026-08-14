import { describe, expect, it } from 'vitest'
import { SearchError } from '../../src/search/errors'
import { extractKeywordGroups } from '../../src/search/keywords'

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
    expect(groups).toHaveLength(3)
    expect(groups[0].query).toBe('LLM 测试：agent 评测')
    expect(groups[1].query).toBe('RAG')
    expect(groups[2].query).toBe('大模型幻觉')
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

  it('deduplicates identical queries and caps at maxGroups', () => {
    const plan = ['## 检索关键词', '- RAG', '- RAG', '- 幻觉', '- 检索'].join('\n')
    expect(extractKeywordGroups(plan, 2).map((g) => g.query)).toEqual(['RAG', '幻觉'])
  })

  it('throws a clear error when nothing parseable exists', () => {
    expect(() => extractKeywordGroups('# 空计划')).toThrow(SearchError)
  })
})
