export interface SearchConfig {
  topN: number
  perQuery: number
  timeoutMs: number
  semanticScholarApiKey?: string
  openAlexMailto?: string
}

export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  return {
    topN: positiveInt(env.SEARCH_TOP_N, 15),
    perQuery: positiveInt(env.SEARCH_PER_QUERY, 25),
    timeoutMs: positiveInt(env.SEARCH_TIMEOUT_MS, 30_000),
    semanticScholarApiKey: env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
    openAlexMailto: env.OPENALEX_MAILTO?.trim() || undefined,
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
