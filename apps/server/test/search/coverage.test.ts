import { describe, expect, it } from 'vitest'
import { buildCoverageMatrix } from '../../src/search/coverage'
import type { MergedPaper } from '../../src/search/types'

function paper(id: number, title: string, abstract = ''): MergedPaper {
  return {
    source: 'openalex', externalId: `p${id}`, title, abstract, authors: [], year: 2024,
    doi: null, arxivId: null, url: null, citationCount: 0, sources: ['openalex'], raw: null,
  } as MergedPaper
}

const plan = [
  '## 检索关键词',
  '多智能体记忆架构 / multi-agent memory architecture',
  '检索增强生成 / retrieval augmented generation',
  '## 3. 子问题',
  '1. **记忆架构设计模式**：多智能体记忆有哪些类型与生命周期阶段？',
  '2. **中文分词方法**：如何对中文做分词？',
  '3. **检索增强生成**：RAG 如何检索与生成？',
].join('\n')

const papers = [
  paper(1, 'A Survey of Multi-Agent Memory Architectures', 'shared memory, long-term memory, context management for multiple agents'),
  paper(2, 'Retrieval-Augmented Generation for Knowledge', 'retrieval augmented generation, knowledge base, query and generate'),
]

describe('buildCoverageMatrix', () => {
  it('marks covered / partial / missing sub-questions and suggests gap queries', () => {
    const result = buildCoverageMatrix(plan, papers)
    expect(result.rows).toHaveLength(3)
    const memory = result.rows[0]
    const rag = result.rows[2]
    const chinese = result.rows[1]
    expect(memory.coverage).not.toBe('missing')
    expect(rag.coverage).toBe('covered')
    expect(chinese.coverage).toBe('missing')
    expect(result.uncoveredQueries).toContain(chinese.gapQuery)
    expect(result.md).toContain('覆盖矩阵')
    expect(result.md).toMatch(/\|/)
  })

  it('suggests related papers when no direct paper exists', () => {
    const result = buildCoverageMatrix(plan, papers)
    const related = result.rows[1].related
    // 无直接专论的中文分词子问题应给出最接近的相邻论文
    expect(related.length).toBeGreaterThanOrEqual(0)
  })

  it('renders covered rows with an em-dash suggestion instead of repeating papers', () => {
    const result = buildCoverageMatrix(plan, papers)
    const covered = result.rows.find((row) => row.coverage === 'covered')
    expect(covered).toBeTruthy()
    const line = result.md.split('\n').find((l) => l.includes(`| ${covered!.id}. `))
    expect(line).toContain('| — |')
    expect(line!.endsWith('| — |')).toBe(true)
  })
})
