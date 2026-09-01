import { tokenize } from '../evidence/evaluation'
import type { CoverageRow } from './coverage'

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

/** 证据卡附加段：逐篇标注来源（标题/站点/URL/访问日期），说明不进引用编号序列。 */
export function renderOfficialDocsSection(docs: Map<number, DocRef[]>): string {
  if (docs.size === 0) return ''
  const lines = ['', '## 官方文档参考（不进引用编号与核验序列）', '', '> 以下内容来自框架官方文档（一手来源），用于补充学术文献覆盖稀疏的工程实践类子问题；写作中引用时请标注"（依据 XX 官方文档）"。', '']
  const today = new Date().toISOString().slice(0, 10)
  for (const [rowId, refs] of docs) {
    lines.push(`### 子问题 ${rowId} 的官方文档参考`, '')
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
