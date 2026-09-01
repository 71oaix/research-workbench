import { tokenize } from '../evidence/evaluation'
import type { CoverageRow } from './coverage'
import { extractBilingualKeywords } from './coverage'
import { FirecrawlClient } from './firecrawl'

export interface DocRef {
  title: string
  url: string
  site: string
  excerpt: string
}

/**
 * 官方文档白名单（一手来源）。抓取仅限这些域；llms.txt/.md 惯例见
 * docs/research/2026-09-01-web-content-acquisition-survey.md。
 */
const OFFICIAL_DOCS: { key: string; base: string; site: string }[] = [
  { key: 'autogen', base: 'https://microsoft.github.io/autogen/stable/', site: 'AutoGen 官方文档' },
  { key: 'langgraph', base: 'https://langchain-ai.github.io/langgraph/', site: 'LangGraph 官方文档' },
  { key: 'langchain', base: 'https://python.langchain.com/docs/', site: 'LangChain 官方文档' },
  { key: 'crewai', base: 'https://docs.crewai.com/', site: 'CrewAI 官方文档' },
  { key: 'mem0', base: 'https://docs.mem0.ai/', site: 'Mem0 官方文档' },
  { key: 'letta', base: 'https://docs.letta.com/', site: 'Letta (MemGPT) 官方文档' },
  { key: 'memgpt', base: 'https://docs.letta.com/', site: 'Letta (MemGPT) 官方文档' },
  { key: 'metagpt', base: 'https://docs.metagpt.xyz/', site: 'MetaGPT 官方文档' },
]

const MAX_DOCS_PER_ROW = 3
const MAX_EXCERPT_CHARS = 2000

/**
 * C 组官方文档补位：对覆盖矩阵中仍未覆盖、且命中白名单框架锚点的子问题，
 * 抓取官方文档作为证据补充（writer 参考素材；不进引用编号与核验序列）。
 * 流程：白名单匹配 → {base}llms.txt 选页 → .md 直取优先 / HTML 去噪兜底 → 截断。
 * 任何失败静默跳过，不影响主流程。
 */
export async function fetchOfficialDocs(
  rows: CoverageRow[],
  opts: { timeoutMs: number }
): Promise<Map<number, DocRef[]>> {
  const result = new Map<number, DocRef[]>()
  for (const row of rows) {
    if (row.coverage === 'covered') continue
    const bases = matchDomains(row.question)
    if (bases.length === 0) continue
    const refs: DocRef[] = []
    for (const base of bases) {
      if (refs.length >= MAX_DOCS_PER_ROW) break
      try {
        const pages = await pickPages(base, row.question, opts.timeoutMs)
        for (const page of pages) {
          if (refs.length >= MAX_DOCS_PER_ROW) break
          const text = await readPage(page.url, opts.timeoutMs)
          if (!text || text.length < 200) continue
          refs.push({
            title: page.title,
            url: page.url,
            site: base.site,
            excerpt: text.slice(0, MAX_EXCERPT_CHARS),
          })
        }
      } catch {
        // 静默：文档补位是增强，不阻塞主流程
      }
    }
    if (refs.length > 0) result.set(row.id, refs)
  }
  return result
}

/**
 * Firecrawl 兜底：对学术文献覆盖稀疏、且白名单未命中的子问题做真实 web 搜索。
 * 搜索命中任意权威网页（官方文档/博客/教程/仓库 README），作为 writer 参考素材。
 *
 * 与白名单的定位差异：白名单是确定性、免费的优先种子（llms.txt/.md 直接抓取）；
 * Firecrawl 是"代码判断覆盖不足时触发的真搜索工具"，负责白名单覆盖不到的子问题。
 * 预算：每行至多 1 次 search；description 足够长直接用，过短才对 top-1 scrape。
 * 失败静默跳过（无 key/网络/超时），不影响主流程。
 */
export async function fetchWebDocs(
  rows: CoverageRow[],
  opts: {
    timeoutMs: number
    apiKey?: string
    planContent?: string
  }
): Promise<Map<number, DocRef[]>> {
  const result = new Map<number, DocRef[]>()
  if (!opts.apiKey || !opts.apiKey.trim()) return result
  const client = new FirecrawlClient({ apiKey: opts.apiKey, timeoutMs: opts.timeoutMs })
  // 双语搭桥：中文子问题 + 计划中的英文关键词，提升英文权威网页命中率
  const enHints = opts.planContent
    ? extractBilingualKeywords(opts.planContent)
        .map((pair) => pair.en)
        .filter((en) => en.trim())
        .slice(0, 6)
        .join(' ')
    : ''
  for (const row of rows) {
    if (row.coverage === 'covered') continue
    try {
      const query = [row.question, enHints].filter(Boolean).join(' ')
      const hits = await client.search(query, { limit: MAX_DOCS_PER_ROW + 1 })
      const refs: DocRef[] = []
      for (const hit of hits.slice(0, MAX_DOCS_PER_ROW)) {
        let excerpt = hit.description?.trim() ?? ''
        if (excerpt.length < 600) {
          const scraped = await client.scrape(hit.url)
          excerpt = scraped ?? excerpt
        }
        if (!excerpt) continue
        refs.push({
          title: hit.title || hit.url,
          url: hit.url,
          site: hostLabel(hit.url),
          excerpt: excerpt.slice(0, MAX_EXCERPT_CHARS),
        })
      }
      if (refs.length > 0) result.set(row.id, refs)
    } catch {
      // 静默：搜索兜底是增强，不阻塞主流程
    }
  }
  return result
}

/** 合并白名单与 Firecrawl 两组参考（按行、按 url 去重，白名单优先）。 */
export function mergeDocRefs(
  ...maps: (Map<number, DocRef[]> | undefined)[]
): Map<number, DocRef[]> {
  const merged = new Map<number, DocRef[]>()
  for (const map of maps) {
    if (!map) continue
    for (const [rowId, refs] of map) {
      const existing = merged.get(rowId) ?? []
      const seen = new Set(existing.map((ref) => ref.url))
      const fresh = refs.filter((ref) => !seen.has(ref.url))
      merged.set(rowId, [...existing, ...fresh])
    }
  }
  return merged
}

/** 从 URL 取站点标签（无泛域名硬编码：任何命中网页都按 host 标注来源）。 */
function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return `${host}（网页）`
  } catch {
    return 'web（网页）'
  }
}

/** 证据卡附加段：逐篇标注来源（标题/站点/URL/访问日期），说明不进引用编号序列。 */
export function renderOfficialDocsSection(docs: Map<number, DocRef[]>): string {
  if (docs.size === 0) return ''
  const lines = ['', '## 补充参考（官方文档 / 网页，不进引用编号与核验序列）', '', '> 以下内容来自框架官方文档（一手来源）与 web 搜索结果（Firecrawl 兜底），用于补充学术文献覆盖稀疏的工程实践类子问题；写作中引用时请标注"（依据 XX 官方文档 / 网页）"。', '']
  const today = new Date().toISOString().slice(0, 10)
  for (const [rowId, refs] of docs) {
    lines.push(`### 子问题 ${rowId} 的补充参考`, '')
    for (const ref of refs) {
      lines.push(`#### ${ref.title}`, '', `- 来源：${ref.site}（${today} 访问）`, `- 链接：${ref.url}`, '', ref.excerpt, '')
    }
  }
  return lines.join('\n')
}

/** 仅题录名单：摘要与全文均不可得的候选（未入证据池），随报告可查。 */
export function renderTitlesOnlySection(titles: { title: string; reason: string }[]): string {
  if (titles.length === 0) return ''
  const lines = ['', '## 仅题录（未入证据池）', '', '> 以下候选摘要与全文均不可得，无法支撑相关度定级与引用核验，未纳入证据池。', '']
  for (const item of titles) {
    lines.push(`- ${item.title}（${item.reason}）`)
  }
  return lines.join('\n')
}

function matchDomains(question: string): { key: string; base: string; site: string }[] {
  const words = new Set((question.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []))
  return OFFICIAL_DOCS.filter((entry) => words.has(entry.key))
}

interface PageCandidate {
  title: string
  url: string
}

/** L0 选页：读 {base}llms.txt 导览，按与子问题的词元交叠挑页；无导览则回退主页。 */
async function pickPages(
  base: { key: string; base: string; site: string },
  question: string,
  timeoutMs: number
): Promise<PageCandidate[]> {
  const qTokens = tokenize(question.toLowerCase())
  let candidates: PageCandidate[] = []
  const llmsTxt = await fetchText(new URL('llms.txt', base.base).toString(), timeoutMs)
  if (llmsTxt) {
    const scored = parseLlmsTxt(llmsTxt)
      .map((entry) => {
        const tokens = tokenize(`${entry.title} ${entry.desc}`.toLowerCase())
        return { ...entry, score: [...qTokens].filter((t) => tokens.has(t)).length }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
    candidates = scored.slice(0, MAX_DOCS_PER_ROW).map((entry) => ({ title: entry.title, url: entry.url }))
  }
  if (candidates.length === 0) {
    candidates = [{ title: `${base.site} 首页`, url: base.base }]
  }
  return candidates
}

function parseLlmsTxt(md: string): { title: string; url: string; desc: string }[] {
  const out: { title: string; url: string; desc: string }[] = []
  const re = /-\s*\[([^\]]+)\]\(([^)\s]+)\)\s*:?\s*(.*)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(md))) {
    out.push({ title: match[1].trim(), url: match[2].trim(), desc: match[3].trim() })
  }
  return out
}

/** L1 读页：llms.txt v2 惯例 .md 直取优先；非 Markdown 响应回退 HTML 去噪。 */
async function readPage(url: string, timeoutMs: number): Promise<string | null> {
  const mdUrl = url.replace(/\.html?$/i, '') + '.md'
  const asMd = await fetchText(mdUrl, timeoutMs)
  if (asMd && !/^<!doctype html|^<html/i.test(asMd.trim())) return asMd
  const html = await fetchText(url, timeoutMs)
  if (!html) return null
  return extractTextFromHtml(html)
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'ResearchWorkbench/0.1 (academic survey agent; contact via repo)' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** 简化正文去噪（Node 内置，无依赖）：剥脚本/样式/导航等样板，优先 main/article，压缩空白。 */
export function extractTextFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|noscript)[\s\S]*?<\/\1>/gi, ' ')
  const main = cleaned.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)
  const scope = main ? main[2] : cleaned
  return scope
    .replace(/<h([1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
