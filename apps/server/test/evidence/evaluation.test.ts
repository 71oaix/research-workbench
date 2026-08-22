import { describe, expect, it } from 'vitest'
import {
  buildEvaluationInputs,
  computeSixDimScores,
  extractThemeTokens,
} from '../../src/evidence/evaluation'
import type { EvidencePoolCard } from '../../src/evidence/evidencePool'

function card(title: string, abstract = ''): EvidencePoolCard {
  return {
    key: `title:${title}`,
    title,
    doi: null,
    arxivId: null,
    url: null,
    citationCount: 0,
    authors: 'A',
    year: 2020,
    abstract,
    versions: [1],
  }
}

const planMd = [
  '## 锚定点',
  '### 核心概念',
  '- 多智能体记忆架构',
  '- 记忆检索与遗忘机制',
  '## 检索关键词',
  'large language model / 大语言模型',
  'multi-agent / 多智能体',
  'memory architecture / 记忆架构',
  '## 综述大纲',
  '1. 引言',
  '2. 大语言模型智能体',
  '3. 记忆架构方法',
  '4. 总结',
].join('\n')

describe('extractThemeTokens', () => {
  it('extracts english words and chinese bigrams from keywords', () => {
    const tokens = extractThemeTokens(planMd)
    expect(tokens.has('language')).toBe(true)
    expect(tokens.has('agent')).toBe(true)
    expect(tokens.has('记忆')).toBe(true)
    expect(tokens.has('架构')).toBe(true)
  })
})

describe('buildEvaluationInputs', () => {
  it('builds reference data without emitting verdicts', () => {
    const ref = buildEvaluationInputs({
      planMd,
      draftMd: 'draft with [1] and [2] and [1]',
      cardsMd: '# 证据池\n### [1] A',
      rawCardsMd: '- 失败源：Semantic Scholar、OpenAlex',
      cards: [card('A')],
    })
    expect(ref.coreConcepts).toContain('多智能体记忆架构')
    expect(ref.planOutline).toHaveLength(4)
    expect(ref.draftCitationCount).toBe(3)
    expect(ref.draftUniqueRefs).toBe(2)
    expect(ref.failedSourceCount).toBe(2)
    expect(ref.failedSourceSample.length).toBeLessThanOrEqual(5)
    expect(ref.md).toContain('规则统计参考')
    expect(ref.md).not.toContain('通过（')
  })

  it('handles plans without outline or concepts gracefully', () => {
    const ref = buildEvaluationInputs({
      planMd: '# 计划\n没有关键词小节',
      draftMd: '',
      cardsMd: '',
      rawCardsMd: '',
      cards: [card('x')],
    })
    expect(ref.coreConcepts).toEqual([])
    expect(ref.planOutline).toEqual([])
    expect(ref.failedSourceCount).toBe(0)
  })
})

describe('computeSixDimScores', () => {
  it('computes six dimensions with notes and a composite score', () => {
    const cardsMd = [
      '### [1] Multi-Agent Memory',
      '- 相关度：高',
      '- 摘要：multi-agent shared memory architecture',
      '### [2] RAG Survey',
      '- 相关度：部分',
      '- 摘要：retrieval augmented generation',
    ].join('\n')
    const result = computeSixDimScores({
      cards: [
        card('Multi-Agent Memory', 'multi-agent shared memory architecture'),
        card('RAG Survey', 'retrieval augmented generation survey'),
      ],
      cardsMd,
      themeTokens: ['memory', '多智能体', '架构'],
      planOutline: ['引言', '大语言模型智能体', '记忆架构方法', '总结'],
      draftMd: 'draft about 大语言模型智能体 and 记忆架构方法 引用 [1][2]',
      failedSourceCount: 1,
      draftUniqueRefs: 2,
    })
    expect(result.dims).toHaveLength(7)
    const byName = Object.fromEntries(result.dims.map((item) => [item.dim, item.score]))
    expect(byName['主题匹配']).toBeGreaterThanOrEqual(0)
    expect(byName['相关度']).toBe(4)
    expect(byName['大纲覆盖']).toBeGreaterThan(0)
    expect(byName['来源失败']).toBe(4)
    expect(byName['完整性']).toBeGreaterThanOrEqual(0)
    expect(byName['综合']).toBeGreaterThanOrEqual(0)
    expect(result.md).toContain('六维完整评分')
    expect(result.md).toContain('|')
  })
})
