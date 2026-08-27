import { describe, expect, it } from 'vitest'
import {
  buildJudgePrompt,
  parseJudgeOutput,
  refineCoverage,
} from '../../src/search/coverageJudge'
import type { CoverageRow } from '../../src/search/coverage'

describe('parseJudgeOutput', () => {
  it('parses JSON array from noisy output and keeps valid verdicts', () => {
    const output = [
      '好的，判定如下：',
      '[{"id":1,"coverage":"covered","papers":[1,3]},{"id":2,"coverage":"missing","papers":[]}]',
      '以上。',
    ].join('\n')
    expect(parseJudgeOutput(output, 5)).toEqual([
      { id: 1, coverage: 'covered', papers: [1, 3] },
      { id: 2, coverage: 'missing', papers: [] },
    ])
  })

  it('filters out-of-range paper ids (hallucination guard) and invalid coverage values', () => {
    const output =
      '[{"id":1,"coverage":"covered","papers":[2,9]},{"id":3,"coverage":"excellent","papers":[1]}]'
    expect(parseJudgeOutput(output, 3)).toEqual([{ id: 1, coverage: 'covered', papers: [2] }])
  })

  it('returns empty for non-JSON or malformed output', () => {
    expect(parseJudgeOutput('没有 JSON', 5)).toEqual([])
    expect(parseJudgeOutput('[{"id":"x","coverage":"covered"}]', 5)).toEqual([])
    expect(parseJudgeOutput('{broken', 5)).toEqual([])
  })
})

describe('refineCoverage', () => {
  const rows: CoverageRow[] = [
    { id: 1, question: 'q1', coverage: 'partial', papers: [1], gapQuery: 'gq1', related: [] },
    { id: 2, question: 'q2', coverage: 'missing', papers: [], gapQuery: 'gq2', related: [] },
  ]

  it('upgrades only rows present in verdicts and truncates papers to 5', () => {
    const refined = refineCoverage(rows, [
      { id: 2, coverage: 'covered', papers: [1, 2, 3, 4, 5, 6, 7] },
    ])
    expect(refined[0]).toBe(rows[0])
    expect(refined[1].coverage).toBe('covered')
    expect(refined[1].papers).toEqual([1, 2, 3, 4, 5])
    expect(refined[1].source).toBe('model')
  })

  it('marks source model only when the verdict actually changes the row', () => {
    const refined = refineCoverage(rows, [{ id: 2, coverage: 'missing', papers: [] }])
    expect(refined[1].coverage).toBe('missing')
    expect(refined[1].source).toBeUndefined()
  })

  it('keeps rule results when verdict list is empty', () => {
    expect(refineCoverage(rows, [])).toEqual(rows)
  })
})

describe('buildJudgePrompt', () => {
  it('includes questions, numbered papers and JSON-only instruction', () => {
    const prompt = buildJudgePrompt(
      [{ id: 2, question: '记忆评测基准有哪些' }],
      [{ id: 4, title: 'A Benchmark', abstract: 'We benchmark agent memory.'.repeat(80) }],
      ['记忆评测基准 / memory benchmark']
    )
    expect(prompt).toContain('子问题2: 记忆评测基准有哪些')
    expect(prompt).toContain('[4] A Benchmark｜')
    expect(prompt).toContain('memory benchmark')
    expect(prompt).toContain('"coverage"')
    expect(prompt.length).toBeLessThan(3000)
  })
})
