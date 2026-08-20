import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeArxiv, normalizeDoi, normalizeTitle } from '../search/merge'
import type { MergedPaper } from '../search/types'

export interface FullTextResult {
  text: string
  url: string
  source: string
}

export type DownloadReason = 'ok' | 'no_oa' | 'failed'

export interface AcquireResult {
  result: FullTextResult | null
  reason: DownloadReason
}

export interface AcquireOptions {
  dir: string
  maxChars: number
  extractText?: (buffer: Buffer) => Promise<string>
  unpaywallEmail?: string
}

const MIN_TEXT_CHARS = 500

export function resolvePdfUrls(paper: MergedPaper): string[] {
  const urls: string[] = []
  const push = (url: string | null | undefined) => {
    if (url && !urls.includes(url)) urls.push(url)
  }
  if (paper.arxivId) push(`https://arxiv.org/pdf/${paper.arxivId}`)
  if (paper.url && /\.pdf(\?|$)/i.test(paper.url)) push(paper.url)
  const raw = safeJson(paper.raw)
  const s2Pdf = (raw?.openAccessPdf as { url?: unknown } | undefined)?.url
  if (typeof s2Pdf === 'string') push(s2Pdf)
  const oaPdf = (raw?.best_oa_location as { pdf_url?: unknown } | undefined)?.pdf_url
  if (typeof oaPdf === 'string') push(oaPdf)
  return urls
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
  options: AcquireOptions
): Promise<AcquireResult> {
  const extract = options.extractText ?? extractPdfText
  const unpaywallEnabled = Boolean(options.unpaywallEmail && paper.doi)
  let urls = resolvePdfUrls(paper)
  let consultedUnpaywall = false
  if (urls.length === 0 && unpaywallEnabled) {
    const pdf = await lookupUnpaywallPdf(paper.doi as string, options.unpaywallEmail as string)
    consultedUnpaywall = true
    if (pdf) urls.push(pdf)
  }
  if (urls.length === 0) return { result: null, reason: 'no_oa' }
  for (const url of urls) {
    const result = await tryDownload(paper, url, options, extract)
    if (result) return { result, reason: 'ok' }
  }
  // 已有候选但全部失败时，Unpaywall 作为最后一层兜底
  if (!consultedUnpaywall && unpaywallEnabled) {
    const pdf = await lookupUnpaywallPdf(paper.doi as string, options.unpaywallEmail as string)
    if (pdf) {
      const result = await tryDownload(paper, pdf, options, extract)
      if (result) return { result, reason: 'ok' }
    }
  }
  return { result: null, reason: 'failed' }
}

async function lookupUnpaywallPdf(doi: string, email: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      best_oa_location?: { url_for_pdf?: unknown }
    }
    const pdf = data.best_oa_location?.url_for_pdf
    return typeof pdf === 'string' && pdf ? pdf : null
  } catch {
    return null
  }
}

async function tryDownload(
  paper: MergedPaper,
  url: string,
  options: AcquireOptions,
  extractText: (buffer: Buffer) => Promise<string>
): Promise<FullTextResult | null> {
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
  const text = await extractText(buffer)
  if (!text || text.length < MIN_TEXT_CHARS) return null
  mkdirSync(options.dir, { recursive: true })
  const safeName = `${paper.source}-${paper.externalId}`.replace(/[^\w.-]+/g, '_')
  writeFileSync(path.join(options.dir, `${safeName}.pdf`), buffer)
  return {
    text: text.slice(0, options.maxChars),
    url,
    source: url.includes('arxiv.org') ? 'arxiv' : 'oa',
  }
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
