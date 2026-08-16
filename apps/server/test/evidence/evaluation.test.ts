import { describe, expect, it } from 'vitest'
import {
  buildEvaluationReport,
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
  '大语言模型 / 多智能体 / 记忆架构',
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

describe('buildEvaluationReport', () => {
  it('passes the topic gate and reports outline coverage', () => {
    const report = buildEvaluationReport({
      planMd,
      draftMd: '# 综述\n## 引言\n## 大语言模型智能体\n内容 [1]',
      cardsMd: '# cards\n- 失败源：无\n### [1] A',
      cards: [
        card('大语言模型多智能体记忆架构研究', 'multi-agent memory architecture'),
        card('另一篇无关论文', 'unrelated topic'),
      ],
    })
    expect(report.summary.assessable).toBe(true)
    expect(report.summary.topicGatePassed).toBe(true)
    expect(report.summary.outlineCoverage).toEqual({ covered: 2, total: 4 })
    expect(report.summary.failedSources).toEqual([])
    expect(report.md).toContain('主题匹配：通过')
  })

  it('fails the topic gate when no card hits the theme', () => {
    const report = buildEvaluationReport({
      planMd,
      draftMd: '',
      cardsMd: '',
      cards: [card('completely unrelated paper', 'nothing in common')],
    })
    expect(report.summary.topicGatePassed).toBe(false)
    expect(report.md).toContain('未通过')
  })

  it('reports unassessable when the plan has no theme', () => {
    const report = buildEvaluationReport({
      planMd: '# 计划\n没有关键词小节',
      draftMd: '',
      cardsMd: '',
      cards: [card('x')],
    })
    expect(report.summary.assessable).toBe(false)
    expect(report.summary.topicGatePassed).toBe(null)
    expect(report.md).toContain('无法评估')
  })

  it('parses failed sources from cards', () => {
    const report = buildEvaluationReport({
      planMd,
      draftMd: '',
      cardsMd: '- 失败源：Semantic Scholar、OpenAlex',
      cards: [card('大语言模型')],
    })
    expect(report.summary.failedSources).toEqual(['Semantic Scholar', 'OpenAlex'])
    expect(report.md).toContain('Semantic Scholar、OpenAlex')
  })
})
