import { describe, expect, it } from 'vitest'
import { loadSearchConfig } from '../../src/search/config'
import { buildSourceRegistry, detectDomain, selectForDomain } from '../../src/search/sources'

describe('source registry', () => {
  it('marks Semantic Scholar T2 without key and T1 with key', () => {
    const withoutKey = buildSourceRegistry(loadSearchConfig({}))
    expect(withoutKey.find((spec) => spec.source === 'semantic-scholar')?.tier).toBe('T2')
    const withKey = buildSourceRegistry(
      loadSearchConfig({ SEMANTIC_SCHOLAR_API_KEY: 'test-key' })
    )
    expect(withKey.find((spec) => spec.source === 'semantic-scholar')?.tier).toBe('T1')
  })

  it('detects domain and selects matching sources', () => {
    const specs = buildSourceRegistry(loadSearchConfig({}))
    expect(detectDomain('研究 LLM agent 的记忆机制')).toBe('cs')
    const csSources = selectForDomain(specs, 'cs').map((spec) => spec.source)
    expect(csSources).toEqual(
      expect.arrayContaining(['arxiv', 'openalex', 'crossref', 'semantic-scholar'])
    )
  })
})
