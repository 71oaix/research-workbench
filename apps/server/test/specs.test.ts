import { describe, expect, it } from 'vitest'
import { buildSearchSpecPrompt, loadSpec } from '../src/specs'

describe('search spec fragments', () => {
  it('loads named fragments from disk', () => {
    expect(loadSpec('source-tiers')).toContain('T1')
    expect(loadSpec('dedup')).toContain('Jaccard')
  })

  it('builds the researcher spec prompt', () => {
    const prompt = buildSearchSpecPrompt()
    expect(prompt).toContain('检索规范（程序内化）')
    expect(prompt).toContain('T1')
  })
})
