import type { Artifact } from '@research-workbench/shared'
import { normalizeArxiv, normalizeDoi, normalizeTitle } from '../search/merge'

interface PoolCard {
  key: string
  title: string
  doi: string | null
  arxivId: string | null
  url: string | null
  citationCount: number
  authors: string
  abstract: string
  versions: number[]
}

export function buildEvidencePool(artifacts: Artifact[]): {
  cardsMd: string
  cardIds: number[]
} {
  const byKey = new Map<string, PoolCard>()
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
    lines.push(`### [${index + 1}] ${card.title}`, `- ${meta.join(' | ')}`, `- 作者：${card.authors || '未知'}`)
    if (card.abstract) lines.push(`- 摘要：${card.abstract.slice(0, 300)}`)
    lines.push('')
  })

  return { cardsMd: lines.join('\n'), cardIds: cards.map((_, index) => index + 1) }
}

function splitCards(content: string): PoolCard[] {
  const cards: PoolCard[] = []
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
    const abstract = match(body, /摘要[：:]\s*(.+)/) ?? ''
    cards.push({
      key: dedupKey({ doi: doi ?? null, arxiv: arxiv ?? null, title }),
      title,
      doi: doi ?? null,
      arxivId: arxiv ?? null,
      url: url ?? null,
      citationCount: Number.isFinite(citation) ? citation : 0,
      authors,
      abstract,
      versions: [],
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
