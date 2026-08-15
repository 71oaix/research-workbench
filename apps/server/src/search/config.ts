export interface SearchConfig {
  topN: number
  perQuery: number
  maxGroups: number
  compensatePerQuery: number
  minCitations: number
  timeoutMs: number
  semanticScholarApiKey?: string
  openAlexMailto?: string
  crossrefMailto?: string
}

export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  return {
    topN: positiveInt(env.SEARCH_TOP_N, 15),
    perQuery: positiveInt(env.SEARCH_PER_QUERY, 25),
    maxGroups: positiveInt(env.SEARCH_MAX_GROUPS, 10),
    compensatePerQuery: positiveInt(env.SEARCH_COMPENSATE_PER_QUERY, 50),
    minCitations: nonNegativeInt(env.SEARCH_MIN_CITATIONS, 0),
    timeoutMs: positiveInt(env.SEARCH_TIMEOUT_MS, 30_000),
    semanticScholarApiKey: env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
    openAlexMailto: env.OPENALEX_MAILTO?.trim() || undefined,
    crossrefMailto: env.CROSSREF_MAILTO?.trim() || undefined,
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}
