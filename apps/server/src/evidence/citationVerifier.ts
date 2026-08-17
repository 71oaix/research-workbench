import { extractCitationRefs, type CitationRef } from '../citations/lint'
import { ArxivClient } from '../search/arxiv'
import { CrossrefClient } from '../search/crossref'
import { normalizeTitle } from '../search/merge'
import { RateLimiter } from '../search/rateLimiter'
import { SemanticScholarClient } from '../search/semanticScholar'
import type { SearchPaper } from '../search/types'
import type { EvidencePoolCard } from './evidencePool'

const VERIFIER_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const VERIFIER_CACHE_NEGATIVE_TTL_MS = 60 * 60 * 1000
const VERIFIER_CACHE_MAX = 10_000
const verifierCache = new Map<string, { value: SearchPaper | null; expiresAt: number }>()

export type VerificationLevel = 'critical' | 'warning' | 'info'
export type VerificationStatus =
  | 'verified'
  | 'check_suggested'
  | 'needs_fix'
  | 'unverifiable'

export interface CitationVerifierDeps {
  lookupDoi(doi: string): Promise<SearchPaper | null>
  searchByTitleAuthor(title: string, firstAuthor: string): Promise<SearchPaper | null>
  lookupArxiv(id: string): Promise<SearchPaper | null>
  lookupArxivMany?(ids: string[]): Promise<Map<string, SearchPaper | null>>
}

export interface CitationFieldComparison {
  pool: string | number | null
  resolved: string | number | null
  match: boolean | null
}

export interface CitationVerificationItem {
  ref: CitationRef
  pool: EvidencePoolCard | null
  resolved: SearchPaper | null
  resolvedVia: 'doi' | 'search' | 'arxiv' | null
  level: VerificationLevel
  status: VerificationStatus
  confidence: number
  issues: string[]
  fields: {
    title: CitationFieldComparison & { similarity: number | null }
    year: CitationFieldComparison
    firstAuthor: CitationFieldComparison
  }
}

export interface CitationVerificationReport {
  items: CitationVerificationItem[]
  md: string
}

export async function verifyCitations(input: {
  draft: string
  cards: EvidencePoolCard[]
  deps: CitationVerifierDeps
}): Promise<CitationVerificationReport> {
  const items: CitationVerificationItem[] = []
  const seen = new Set<string>()
  const refs: CitationRef[] = []
  for (const ref of extractCitationRefs(input.draft)) {
    const dedupKey = ref.id !== null ? `id:${ref.id}` : `raw:${ref.raw}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    refs.push(ref)
  }
  await warmArxivCache(refs, input.cards, input.deps)
  const results: CitationVerificationItem[] = new Array(refs.length)
  await runWithLimit(refs, 3, async (ref, index) => {
    results[index] = await verifyOne(ref, input.cards, input.deps)
  })
  items.push(...results)

  return { items, md: buildReportMd(items) }
}

export function createVerifierDeps(options?: {
  crossref?: CrossrefClient
  arxiv?: ArxivClient
  semanticScholar?: SemanticScholarClient
}): CitationVerifierDeps {
  const crossref = options?.crossref ?? new CrossrefClient()
  // 核验路径的 arXiv 请求用更保守的 6s/次限流，避免 429
  const arxiv =
    options?.arxiv ?? new ArxivClient({ rateLimiter: new RateLimiter(6000) })
  const semanticScholar = options?.semanticScholar
  return {
    async lookupDoi(doi) {
      return cachedLookup(`doi:${normalizeDoiKey(doi)}`, () => crossref.lookup(doi))
    },
    async searchByTitleAuthor(title, firstAuthor) {
      const query = [title, firstAuthor].filter(Boolean).join(' ')
      const papers = await crossref.search(query, 1)
      if (papers[0]) return papers[0]
      if (semanticScholar) {
        const s2Papers = await semanticScholar.search(query, 1)
        return s2Papers[0] ?? null
      }
      return null
    },
    async lookupArxiv(id) {
      return cachedLookup(`arxiv:${normalizeArxivKey(id)}`, () => arxiv.lookup(id))
    },
    async lookupArxivMany(ids) {
      const map = await arxiv.lookupMany(ids)
      const now = Date.now()
      for (const [id, value] of map) {
        verifierCache.set(`arxiv:${normalizeArxivKey(id)}`, {
          value,
          expiresAt: now + (value ? VERIFIER_CACHE_TTL_MS : VERIFIER_CACHE_NEGATIVE_TTL_MS),
        })
      }
      return map
    },
  }
}

/**
 * 先用一次批量请求预热 arXiv 缓存，逐条核验命中缓存后不再发请求。
 */
async function warmArxivCache(
  refs: CitationRef[],
  cards: EvidencePoolCard[],
  deps: CitationVerifierDeps
): Promise<void> {
  if (!deps.lookupArxivMany) return
  const ids: string[] = []
  for (const ref of refs) {
    if (ref.id === null || ref.id <= 0) continue
    const card = cards[ref.id - 1]
    if (!card) continue
    const arxivId = card.arxivId ?? arxivIdFromDoi(card.doi)
    if (arxivId && !ids.includes(arxivId)) ids.push(arxivId)
  }
  if (ids.length === 0) return
  try {
    await deps.lookupArxivMany(ids)
  } catch {
    // 批量失败不阻塞：逐条核验的回退链会兜底
  }
}

function cachedLookup(
  key: string,
  fn: () => Promise<SearchPaper | null>
): Promise<SearchPaper | null> {
  const hit = verifierCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value)
  return fn().then((value) => {
    trimVerifierCache()
    verifierCache.set(key, {
      value,
      expiresAt: Date.now() + (value ? VERIFIER_CACHE_TTL_MS : VERIFIER_CACHE_NEGATIVE_TTL_MS),
    })
    return value
  })
}

function trimVerifierCache(): void {
  if (verifierCache.size < VERIFIER_CACHE_MAX) return
  const now = Date.now()
  for (const [key, entry] of verifierCache) {
    if (entry.expiresAt <= now) verifierCache.delete(key)
  }
  if (verifierCache.size >= VERIFIER_CACHE_MAX) verifierCache.clear()
}

function normalizeDoiKey(doi: string): string {
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
}

function normalizeArxivKey(id: string): string {
  return id.trim().replace(/^https?:\/\/arxiv\.org\/abs\//, '')
}

async function verifyOne(
  ref: CitationRef,
  cards: EvidencePoolCard[],
  deps: CitationVerifierDeps
): Promise<CitationVerificationItem> {
  if (ref.id === null) {
    return buildItem(ref, null, null, null, 'critical', 'needs_fix', 0, [
      `引用格式异常（${ref.raw}），无法解析编号。`,
    ])
  }

  const card = ref.id > 0 ? cards[ref.id - 1] ?? null : null
  if (!card) {
    return buildItem(ref, null, null, null, 'critical', 'needs_fix', 0, [
      `编号 [${ref.id}] 超出证据池范围（共 ${cards.length} 张卡片）。`,
    ])
  }

  let resolved: SearchPaper | null = null
  let via: 'doi' | 'search' | 'arxiv' | null = null
  let resolveError: string | null = null

  const arxivId = card.arxivId ?? arxivIdFromDoi(card.doi)
  if (arxivId) {
    try {
      resolved = await deps.lookupArxiv(arxivId)
      via = 'arxiv'
    } catch (error) {
      resolveError = error instanceof Error ? error.message : String(error)
    }
  }
  if (!resolved && !arxivId && card.doi) {
    try {
      resolved = await deps.lookupDoi(card.doi)
      via = 'doi'
    } catch (error) {
      resolveError ??= error instanceof Error ? error.message : String(error)
    }
  }
  if (!resolved) {
    try {
      resolved = await deps.searchByTitleAuthor(card.title, firstAuthorOf(card.authors) ?? '')
      via = 'search'
    } catch (error) {
      resolveError ??= error instanceof Error ? error.message : String(error)
    }
  }

  if (!resolved) {
    const suffix = resolveError ? `（查询失败：${resolveError}）` : ''
    return buildItem(
      ref,
      card,
      null,
      null,
      'info',
      'unverifiable',
      0,
      [`Crossref/arXiv/S2 均未能解析到对应记录，无法做字段级核验${suffix}。`]
    )
  }

  return compareFields(ref, card, resolved, via)
}

function compareFields(
  ref: CitationRef,
  card: EvidencePoolCard,
  resolved: SearchPaper,
  via: 'doi' | 'search' | 'arxiv' | null
): CitationVerificationItem {
  const similarity = titleSimilarity(card.title, resolved.title)
  const poolYear = card.year
  const resolvedYear = resolved.year
  const yearMatch = poolYear !== null && resolvedYear !== null ? poolYear === resolvedYear : null
  const poolAuthor = firstAuthorOf(card.authors)
  const resolvedAuthor = resolved.authors[0] ?? null
  const authorMatch =
    poolAuthor !== null && resolvedAuthor !== null
      ? surname(poolAuthor) === surname(resolvedAuthor)
      : null

  const issues: string[] = []
  let level: VerificationLevel = 'info'

  if (similarity === null) {
    issues.push('标题无法分词比对（标题过短或全为停用词）。')
    level = 'warning'
  } else if (similarity < 0.5) {
    issues.push(`标题与 Crossref 记录不一致（相似度 ${similarity.toFixed(2)}），疑似引用指向错误论文。`)
    level = 'critical'
  } else if (similarity < 0.8) {
    issues.push(`标题核心词仅部分一致（相似度 ${similarity.toFixed(2)}），请人工核对。`)
    level = 'warning'
  }

  if (yearMatch === false) {
    issues.push(`年份不一致（证据池 ${poolYear}，Crossref ${resolvedYear}）。`)
    level = level === 'critical' ? level : 'warning'
  } else if (yearMatch === null) {
    issues.push('年份缺失，无法比对。')
  }

  if (authorMatch === false) {
    issues.push(`第一作者不一致（证据池 ${poolAuthor}，Crossref ${resolvedAuthor}）。`)
    level = level === 'critical' ? level : 'warning'
  } else if (authorMatch === null) {
    issues.push('第一作者缺失，无法比对。')
  }

  if (level === 'info' && issues.length === 0) {
    issues.push('标题 / 年份 / 第一作者均与 Crossref 记录一致。')
  }

  const status: VerificationStatus =
    level === 'critical' ? 'needs_fix' : level === 'warning' ? 'check_suggested' : 'verified'

  let confidence = (via === 'doi' ? 0.6 : 0.45)
  if (similarity !== null && similarity >= 0.8) confidence += 0.15
  if (yearMatch === true) confidence += 0.1
  if (authorMatch === true) confidence += 0.1
  if (level === 'critical') confidence = Math.min(confidence, 0.3)
  confidence = Math.round(confidence * 100) / 100

  return {
    ref,
    pool: card,
    resolved,
    resolvedVia: via,
    level,
    status,
    confidence,
    issues,
    fields: {
      title: {
        pool: card.title,
        resolved: resolved.title,
        similarity,
        match: similarity === null ? null : similarity >= 0.8,
      },
      year: { pool: poolYear, resolved: resolvedYear, match: yearMatch },
      firstAuthor: {
        pool: poolAuthor,
        resolved: resolvedAuthor,
        match: authorMatch,
      },
    },
  }
}

function buildItem(
  ref: CitationRef,
  pool: EvidencePoolCard | null,
  resolved: SearchPaper | null,
  resolvedVia: 'doi' | 'search' | 'arxiv' | null,
  level: VerificationLevel,
  status: VerificationStatus,
  confidence: number,
  issues: string[]
): CitationVerificationItem {
  return {
    ref,
    pool,
    resolved,
    resolvedVia,
    level,
    status,
    confidence,
    issues,
    fields: {
      title: { pool: pool?.title ?? null, resolved: resolved?.title ?? null, similarity: null, match: null },
      year: { pool: pool?.year ?? null, resolved: resolved?.year ?? null, match: null },
      firstAuthor: {
        pool: pool ? firstAuthorOf(pool.authors) : null,
        resolved: resolved?.authors[0] ?? null,
        match: null,
      },
    },
  }
}

function buildReportMd(items: CitationVerificationItem[]): string {
  const statusCounts = countBy(items, (item) => item.status)
  const levelCounts = countBy(items, (item) => item.level)
  const confidence =
    items.length > 0
      ? Math.round((items.reduce((sum, item) => sum + item.confidence, 0) / items.length) * 100) / 100
      : 0

  const lines = [
    '# 引用核验报告（多源交叉）',
    '',
    '## 汇总',
    `- 引用条数：${items.length}`,
    `- 状态：Verified ${statusCounts.verified ?? 0} / Check suggested ${statusCounts.check_suggested ?? 0} / Needs fix ${statusCounts.needs_fix ?? 0} / Unverifiable ${statusCounts.unverifiable ?? 0}`,
    `- 级别：Critical ${levelCounts.critical ?? 0} / Warning ${levelCounts.warning ?? 0} / Info ${levelCounts.info ?? 0}`,
    `- 平均置信度：${confidence.toFixed(2)}`,
    '',
    '## 逐条核验',
    '',
    '| 编号 | 状态 | 级别 | 置信度 | 摘要 |',
    '|------|------|------|--------|------|',
    ...items.map((item) => `| ${refLabel(item.ref)} | ${item.status} | ${item.level} | ${item.confidence.toFixed(2)} | ${summaryOf(item)} |`),
    '',
    ...items.flatMap((item) => detailLines(item)),
  ]
  return lines.join('\n')
}

function detailLines(item: CitationVerificationItem): string[] {
  const lines = [
    `### ${refLabel(item.ref)}`,
    `- 状态：${item.status}｜级别：${item.level}｜置信度：${item.confidence.toFixed(2)}${item.resolvedVia ? `｜解析：${viaLabel(item.resolvedVia)}` : ''}`,
    `- 证据池：${item.fields.title.pool ?? '（无）'}｜年份 ${item.fields.year.pool ?? '未知'}｜第一作者 ${item.fields.firstAuthor.pool ?? '未知'}`,
      `- 权威记录：${item.fields.title.resolved ?? '（无）'}｜年份 ${item.fields.year.resolved ?? '未知'}｜第一作者 ${item.fields.firstAuthor.resolved ?? '未知'}`,
    `- 问题：${item.issues.length > 0 ? item.issues.join('；') : '无'}`,
    '',
  ]
  return lines
}

function refLabel(ref: CitationRef): string {
  return ref.kind === 'prefixed' ? `${ref.raw}（归一化为 [${ref.id}]）` : ref.raw
}

function summaryOf(item: CitationVerificationItem): string {
  if (item.status === 'unverifiable') return '未解析到权威记录'
  if (item.status === 'needs_fix') return item.issues[0] ?? '需要修正'
  if (item.status === 'check_suggested') return item.issues[0] ?? '建议人工核对'
  return '标题 / 年份 / 第一作者一致'
}

function countBy(items: CitationVerificationItem[], key: (item: CitationVerificationItem) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    counts[key(item)] = (counts[key(item)] ?? 0) + 1
  }
  return counts
}

function firstAuthorOf(authors: string): string | null {
  if (!authors || authors === '未知') return null
  const first = authors.split(/[,，;；、]/)[0]?.trim()
  return first || null
}

function arxivIdFromDoi(doi: string | null): string | null {
  if (!doi) return null
  const match = doi.match(/10\.48550\/arxiv\.([\d.]+)/i)
  return match ? match[1] : null
}

function viaLabel(via: 'doi' | 'search' | 'arxiv'): string {
  if (via === 'doi') return 'DOI lookup'
  if (via === 'arxiv') return 'arXiv lookup'
  return '标题+作者检索'
}

function surname(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/)
  return parts[parts.length - 1] ?? ''
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'of', 'for', 'on', 'to', 'and', 'with', 'by', 'et', 'al',
])

function titleSimilarity(a: string, b: string): number | null {
  const tokensA = titleTokens(a)
  const tokensB = titleTokens(b)
  if (tokensA.size === 0 || tokensB.size === 0) return null
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++
  }
  return intersection / (tokensA.size + tokensB.size - intersection)
}

function titleTokens(title: string): Set<string> {
  const set = new Set<string>()
  const normalized = normalizeTitle(title)
  for (const token of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (token && !STOPWORDS.has(token)) set.add(token)
  }
  return set
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await fn(items[index], index)
    }
  })
  await Promise.all(workers)
}
