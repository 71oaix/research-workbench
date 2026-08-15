import type { SearchConfig } from './config'
import { CrossrefClient } from './crossref'
import { ArxivClient } from './arxiv'
import { OpenAlexClient } from './openAlex'
import { SemanticScholarClient } from './semanticScholar'
import type { AcademicSearchClient } from './types'

export type SourceTier = 'T1' | 'T2' | 'T3'
export type Domain = 'medical' | 'cs' | 'cross-disciplinary' | 'exhaustive'

export interface SourceSpec {
  source: string
  tier: SourceTier
  domains: Domain[]
  create: (config: SearchConfig) => AcademicSearchClient
}

export function buildSourceRegistry(config: SearchConfig): SourceSpec[] {
  const semanticScholarTier: SourceTier = config.semanticScholarApiKey ? 'T1' : 'T2'
  return [
    {
      source: 'openalex',
      tier: 'T1',
      domains: ['medical', 'cross-disciplinary', 'exhaustive'],
      create: (cfg) => new OpenAlexClient({ mailto: cfg.openAlexMailto, timeoutMs: cfg.timeoutMs }),
    },
    {
      source: 'arxiv',
      tier: 'T1',
      domains: ['cs', 'exhaustive'],
      create: (cfg) => new ArxivClient({ timeoutMs: cfg.timeoutMs }),
    },
    {
      source: 'crossref',
      tier: 'T1',
      domains: ['medical', 'cross-disciplinary', 'exhaustive'],
      create: (cfg) => new CrossrefClient({ mailto: cfg.crossrefMailto, timeoutMs: cfg.timeoutMs }),
    },
    {
      source: 'semantic-scholar',
      tier: semanticScholarTier,
      domains: ['medical', 'cs', 'cross-disciplinary', 'exhaustive'],
      create: (cfg) =>
        new SemanticScholarClient({ apiKey: cfg.semanticScholarApiKey, timeoutMs: cfg.timeoutMs }),
    },
  ]
}

export function detectDomain(planMd: string): Domain {
  const text = planMd.toLowerCase()
  if (/(medical|clinical|biomed|disease|drug|protein|genom|health)/.test(text)) {
    return 'medical'
  }
  if (/(agent|llm|model|software|code|algorithm|machine learning|graph|network|cs\b)/.test(text)) {
    return 'cs'
  }
  return 'cross-disciplinary'
}

export function selectForDomain(specs: SourceSpec[], domain: Domain): SourceSpec[] {
  const matched = specs.filter((spec) => spec.domains.includes(domain))
  return matched.length > 0 ? matched : specs
}
