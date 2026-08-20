import type { Artifact } from '@research-workbench/shared'
import { normalizeArxiv, normalizeDoi, normalizeTitle } from '../search/merge'

export interface EvidencePoolCard {
  key: string
  title: string
  doi: string | null
  arxivId: string | null
  url: string | null
  citationCount: number
  authors: string
  year: number | null
  abstract: string
  versions: number[]
  downloadStatus?: 'ok' | 'no_oa' | 'failed' | null
  downloadError?: string | null
}

export function buildEvidencePool(artifacts: Artifact[]): {
  cardsMd: string
  cardIds: number[]
  cards: EvidencePoolCard[]
} {
  const byKey = new Map<string, EvidencePoolCard>()
  const cardArtifacts = artifacts
    .filter((artifact) => artifact.name === 'research-cards.md')
    .sort((a, b) => a.version - b.version)

  for (const artifact of cardArtifacts) {
    for (const block of splitCards(artifact.content)) {
      const key = block.key
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { ...block, versions: [artifact.version] })
      } else {
        existing.versions = [...new Set([...existing.versions, artifact.version])]
        if (block.citationCount > existing.citationCount) existing.citationCount = block.citationCount
        if (!existing.abstract && block.abstract) existing.abstract = block.abstract
        if (!existing.doi && block.doi) existing.doi = block.doi
        if (!existing.arxivId && block.arxivId) existing.arxivId = block.arxivId
        if (!existing.url && block.url) existing.url = block.url
        if (!existing.downloadStatus && block.downloadStatus) {
          existing.downloadStatus = block.downloadStatus
          existing.downloadError = block.downloadError ?? null
        }
      }
    }
  }

  const cards = [...byKey.values()]
  const lines: string[] = [
    '# 证据池（合并去重）',
    '',
    `- 合并卡片数：${cards.length}`,
    '',
    '## 论文卡片',
    '',
  ]
  cards.forEach((card, index) => {
    const meta = [`引用数：${card.citationCount}`, `来源版本：v${card.versions.join(', v')}`]
    if (card.doi) meta.push(`DOI：${card.doi}`)
    if (card.arxivId) meta.push(`arXiv：${card.arxivId}`)
    if (card.url) meta.push(`链接：${card.url}`)
    if (card.downloadStatus === 'ok') meta.push('全文：已读')
    else if (card.downloadStatus === 'failed') {
      meta.push(`全文：下载失败（${card.downloadError ?? '未知原因'}）`)
    } else if (card.downloadStatus === 'no_oa') {
      meta.push('全文：无开放获取')
    } else {
      meta.push('全文：仅摘要')
    }
    lines.push(`### [${index + 1}] ${card.title}`, `- ${meta.join(' | ')}`, `- 作者：${card.authors || '未知'}`)
    if (card.abstract) lines.push(`- 摘要：${card.abstract.slice(0, 300)}`)
    lines.push('')
  })

  return {
    cardsMd: lines.join('\n'),
    cardIds: cards.map((_, index) => index + 1),
    cards,
  }
}

function splitCards(content: string): EvidencePoolCard[] {
  const cards: EvidencePoolCard[] = []
  const blocks = content.split(/^###\s*\[(\d+)\]\s+/gm)
  for (let i = 1; i < blocks.length; i += 2) {
    const segment = blocks[i + 1] ?? ''
    const lines = segment.split('\n')
    const title = lines[0]?.trim() ?? ''
    const body = lines.slice(1).join('\n')
    if (!title) continue
    const doi = match(body, /DOI[：:]\s*([^\s|]+)/)
    const arxiv = match(body, /arXiv[：:]\s*([^\s|]+)/)
    const url = match(body, /链接[：:]\s*([^\s|]+)/)
    const citation = Number(match(body, /引用数[：:]\s*(\d+)/) ?? '0')
    const authors = match(body, /作者[：:]\s*(.+)/) ?? ''
    const yearMatch = match(body, /年份[：:]\s*(\d{4})/)
    const abstract = match(body, /摘要[：:]\s*(.+)/) ?? ''
    const statusLine = body.split('\n').find((line) => line.includes('全文：'))
    let downloadStatus: EvidencePoolCard['downloadStatus'] = null
    let downloadError: string | null = null
    if (statusLine?.includes('全文：已读')) {
      downloadStatus = 'ok'
    } else if (statusLine?.includes('全文：下载失败')) {
      downloadStatus = 'failed'
      downloadError = statusLine.match(/下载失败（([^）]*)）/)?.[1] ?? null
    } else if (statusLine?.includes('全文：无开放获取')) {
      downloadStatus = 'no_oa'
    }
    cards.push({
      key: dedupKey({ doi: doi ?? null, arxiv: arxiv ?? null, title }),
      title,
      doi: doi ?? null,
      arxivId: arxiv ?? null,
      url: url ?? null,
      citationCount: Number.isFinite(citation) ? citation : 0,
      authors,
      year: yearMatch !== null ? Number(yearMatch) : null,
      abstract,
      versions: [],
      downloadStatus,
      downloadError,
    })
  }
  return cards
}

function dedupKey(paper: { doi: string | null; arxiv: string | null; title: string }): string {
  const doi = normalizeDoi(paper.doi)
  if (doi) return `doi:${doi}`
  const arxiv = normalizeArxiv(paper.arxiv)
  if (arxiv) return `arxiv:${arxiv}`
  return `title:${normalizeTitle(paper.title)}`
}

function match(text: string, pattern: RegExp): string | null {
  const found = text.match(pattern)
  return found ? found[1].trim() : null
}
