import { describe, expect, it } from 'vitest'
import { parseConcernLedger, summarizeConcerns } from '../src/review'

const ledger = `## Concern Ledger
### C1
- severity: major
- blocking: yes
- claim: 结论 X 缺乏证据支撑
- evidence: [1]
- resolution: 补充支持该结论的论文

### C2
- severity: minor
- blocking: no
- claim: 术语使用不一致
- evidence: 3.2 节
- resolution: 统一术语
`

describe('parseConcernLedger', () => {
  it('parses concern blocks with five fields', () => {
    const concerns = parseConcernLedger(ledger)
    expect(concerns).toHaveLength(2)
    expect(concerns[0]).toEqual({
      id: 'C1',
      severity: 'major',
      blocking: true,
      claim: '结论 X 缺乏证据支撑',
      evidence: '[1]',
      resolution: '补充支持该结论的论文',
    })
    expect(concerns[1].severity).toBe('minor')
    expect(concerns[1].blocking).toBe(false)
  })

  it('skips blocks without a claim', () => {
    expect(parseConcernLedger('### C1\n- severity: major\n')).toHaveLength(0)
  })

  it('returns an empty array when there is no ledger', () => {
    expect(parseConcernLedger('no concerns here')).toEqual([])
  })

  it('defaults missing severity to major and missing blocking to false', () => {
    const concerns = parseConcernLedger('### C1\n- claim: 论点\n')
    expect(concerns[0].severity).toBe('major')
    expect(concerns[0].blocking).toBe(false)
    expect(concerns[0].resolution).toBe('')
  })
})

describe('summarizeConcerns', () => {
  it('counts blocking, major and minor concerns', () => {
    expect(summarizeConcerns(parseConcernLedger(ledger))).toEqual({
      total: 2,
      blocking: 1,
      major: 1,
      minor: 1,
    })
  })

  it('returns zero counts for an empty ledger', () => {
    expect(summarizeConcerns([])).toEqual({ total: 0, blocking: 0, major: 0, minor: 0 })
  })
})
