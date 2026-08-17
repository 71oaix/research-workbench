export interface SearchConfig {
  topN: number
  perQuery: number
  maxGroups: number
  sourceConcurrency: number
  downloadMax: number
  downloadTimeoutMs: number
  relevanceWeight: number
  compensatePerQuery: number
  minCitations: number
  readTop: number
  fullTextMaxChars: number
  timeoutMs: number
  semanticScholarApiKey?: string
  openAlexMailto?: string
  crossrefMailto?: string
}

export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  return {
    topN: positiveInt(env.SEARCH_TOP_N, 15),
    perQuery: positiveInt(env.SEARCH_PER_QUERY, 25),
    maxGroups: positiveInt(env.SEARCH_MAX_GROUPS, 8),
    sourceConcurrency: positiveInt(env.SEARCH_SOURCE_CONCURRENCY, 3),
    downloadMax: positiveInt(env.SEARCH_DOWNLOAD_MAX, 25),
    downloadTimeoutMs: positiveInt(env.SEARCH_DOWNLOAD_TIMEOUT_MS, 240_000),
    relevanceWeight: nonNegativeNumber(env.SEARCH_RELEVANCE_WEIGHT, 2),
    compensatePerQuery: positiveInt(env.SEARCH_COMPENSATE_PER_QUERY, 50),
    minCitations: nonNegativeInt(env.SEARCH_MIN_CITATIONS, 0),
    readTop: positiveInt(env.SEARCH_READ_TOP, 8),
    fullTextMaxChars: positiveInt(env.SEARCH_FULLTEXT_MAX, 20_000),
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

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
