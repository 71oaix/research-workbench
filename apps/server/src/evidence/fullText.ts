import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeArxiv, normalizeDoi, normalizeTitle } from '../search/merge'
import type { MergedPaper } from '../search/types'

export interface FullTextResult {
  text: string
  url: string
}

export function resolvePdfUrl(paper: MergedPaper): string | null {
  if (paper.arxivId) {
    return `https://arxiv.org/pdf/${paper.arxivId}`
  }
  if (paper.url && /\.pdf(\?|$)/i.test(paper.url)) {
    return paper.url
  }
  const raw = safeJson(paper.raw)
  const openAccessPdf = raw?.openAccessPdf as { url?: unknown } | undefined
  if (typeof openAccessPdf?.url === 'string' && openAccessPdf.url) {
    return openAccessPdf.url
  }
  const bestOaLocation = raw?.best_oa_location as { pdf_url?: unknown } | undefined
  if (typeof bestOaLocation?.pdf_url === 'string' && bestOaLocation.pdf_url) {
    return bestOaLocation.pdf_url
  }
  return null
}

export function fullTextKey(paper: {
  doi: string | null
  arxivId: string | null
  title: string
}): string {
  const doi = normalizeDoi(paper.doi)
  if (doi) return `doi:${doi}`
  const arxiv = normalizeArxiv(paper.arxivId)
  if (arxiv) return `arxiv:${arxiv}`
  return `title:${normalizeTitle(paper.title)}`
}

export async function acquireFullText(
  paper: MergedPaper,
  options: { dir: string; maxChars: number }
): Promise<FullTextResult | null> {
  const url = resolvePdfUrl(paper)
  if (!url) return null
  let buffer: Buffer
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) return null
    buffer = Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
  if (buffer.length === 0 || !buffer.subarray(0, 5).toString('ascii').startsWith('%PDF')) {
    return null
  }
  mkdirSync(options.dir, { recursive: true })
  const safeName = `${paper.source}-${paper.externalId}`.replace(/[^\w.-]+/g, '_')
  writeFileSync(path.join(options.dir, `${safeName}.pdf`), buffer)
  const text = await extractPdfText(buffer)
  if (!text) return null
  return { text: text.slice(0, options.maxChars), url }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse 的入口（index.js）在 ESM 动态导入下 module.parent 为空，
    // 会触发其自带调试分支读取不存在的 test/data PDF 而抛错；
    // 直接加载实现模块（lib/pdf-parse.js）绕过该分支。
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
    const result = await pdfParse(buffer)
    return result.text?.trim() ?? ''
  } catch {
    return ''
  }
}

function safeJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}
