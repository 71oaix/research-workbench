import { describe, expect, it } from 'vitest'
import type { Artifact } from '@research-workbench/shared'
import { buildEvidencePool } from '../../src/evidence/evidencePool'

function artifact(name: string, version: number, content: string): Artifact {
  return {
    id: `${name}-${version}`,
    workflowId: 'wf-1',
    stepId: null,
    name,
    content,
    version,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('buildEvidencePool', () => {
  it('merges versions of the same paper and renumbers', () => {
    const v1 = artifact(
      'research-cards.md',
      1,
      ['### [1] Attention Is All You Need', '- 引用数：10 | DOI：10.1000/a'].join('\n')
    )
    const v2 = artifact(
      'research-cards.md',
      2,
      ['### [1] Attention is all you need', '- 引用数：20 | DOI：10.1000/a'].join('\n')
    )
    const pool = buildEvidencePool([v1, v2])
    expect(pool.cardIds).toEqual([1])
    expect(pool.cardsMd).toContain('合并卡片数：1')
    expect(pool.cardsMd).toContain('来源版本：v1, v2')
    expect(pool.cardsMd).toContain('引用数：20')
  })

  it('keeps distinct papers as separate cards', () => {
    const v1 = artifact('research-cards.md', 1, '### [1] Paper A\n### [2] Paper B')
    const pool = buildEvidencePool([v1])
    expect(pool.cardIds).toEqual([1, 2])
  })
})
