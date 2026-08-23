import { hasIntersection, tokenize } from './evaluation'

export interface SummaryCard {
  id: number
  title: string
  level: 'high' | 'partial' | null
  authors: string
  year: number | null
  doi: string | null
  arxivId: string | null
  url: string | null
  citationCount: number
  abstract: string
}

export interface TopicGroup {
  concept: string
  primary: number[]
  related: number[]
}

export function parseSummaryCards(cardsMd: string): SummaryCard[] {
  const cards: SummaryCard[] = []
  const blocks = cardsMd.split(/^###\s*\[(\d+)\]\s+/gm)
  for (let i = 1; i < blocks.length; i += 2) {
    const id = Number(blocks[i])
    const body = blocks[i + 1] ?? ''
    const lines = body.split('\n')
    const title = lines[0]?.trim() ?? ''
    if (!title) continue
    const text = lines.slice(1).join('\n')
    const levelMatch = text.match(/相关度[：:]\s*(高|部分)/)
    const doi = match(text, /DOI[：:]\s*([^\s|]+)/)
    const arxiv = match(text, /arXiv[：:]\s*([^\s|]+)/)
    const url = match(text, /链接[：:]\s*([^\s|]+)/)
    const authors = match(text, /作者[：:]\s*(.+)/) ?? ''
    const year = Number(match(text, /年份[：:]\s*(\d{4})/) ?? '')
    const citationCount = Number(match(text, /引用数[：:]\s*(\d+)/) ?? '0')
    const abstract = match(text, /摘要[：:]\s*(.+)/) ?? ''
    cards.push({
      id,
      title,
      level: levelMatch ? (levelMatch[1] === '部分' ? 'partial' : 'high') : null,
      authors,
      year: Number.isFinite(year) && year > 0 ? year : null,
      doi: doi ?? null,
      arxivId: arxiv ?? null,
      url: url ?? null,
      citationCount: Number.isFinite(citationCount) ? citationCount : 0,
      abstract,
    })
  }
  return cards
}

/**
 * 从 plan 提取分组概念：锚定点 / 子问题 / 核心概念 小节的行内条目，
 * 清洗后去重，最多取 8 个；失败时回退主题词（英文词 + 中文 bigram 组合）。
 */
export function extractGroupConcepts(planMd: string): string[] {
  const source = [
    ...extractSectionItems(planMd, '检索关键词'),
    ...extractSectionItems(planMd, '锚定点'),
    ...extractSectionItems(planMd, '子问题'),
    ...extractSectionItems(planMd, '核心概念'),
  ]
  const cleaned = source
    .map((item) =>
      item
        .replace(/^[-*•]\s*/, '')
        .replace(/^#{1,4}\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/[：:].*$/, '')
        .trim()
    )
    .filter((item) => item.length > 1 && !/^(时间范围|方法|场景)$/.test(item))
  const unique = [...new Set(cleaned)].slice(0, 8)
  if (unique.length > 0) return unique
  return [...tokenize(planMd)].slice(0, 8)
}

/**
 * 主题分组：概念为组，卡片按“标题+摘要”与概念词元交叠分组；
 * 交叠词元最多的概念为主组，其余交叠概念为相关组，未命中任何概念进“其他”。
 */
export function buildTopicGroups(cards: SummaryCard[], planMd: string): TopicGroup[] {
  const concepts = extractGroupConcepts(planMd)
  const groups: TopicGroup[] = concepts.map((concept) => ({
    concept,
    primary: [],
    related: [],
  }))
  const unmatched: number[] = []

  for (const card of cards) {
    const cardTokens = tokenize(`${card.title} ${card.abstract}`)
    let bestIndex = -1
    let bestScore = 0
    const hits: number[] = []
    concepts.forEach((concept, index) => {
      const conceptTokens = tokenize(concept)
      if (!hasIntersection(cardTokens, conceptTokens)) return
      hits.push(index)
      let score = 0
      for (const token of cardTokens) {
        if (conceptTokens.has(token)) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })
    if (bestIndex >= 0) {
      groups[bestIndex].primary.push(card.id)
      for (const index of hits) {
        if (index !== bestIndex && !groups[index].related.includes(card.id)) {
          groups[index].related.push(card.id)
        }
      }
    } else {
      unmatched.push(card.id)
    }
  }
  if (unmatched.length > 0) {
    groups.push({ concept: '其他', primary: unmatched, related: [] })
  }
  return groups.filter((group) => group.primary.length > 0 || group.related.length > 0)
}

export function buildReferencesMd(cards: SummaryCard[]): string {
  if (cards.length === 0) return '（无卡片）'
  return cards
    .map((card) => {
      const ident =
        card.doi ??
        (card.arxivId ? `arXiv:${card.arxivId}` : null) ??
        card.url ??
        '（无标识）'
      const year = card.year ? `（${card.year}）` : ''
      return `- [${card.id}] ${card.title}${year}｜${card.authors || '作者未知'}｜${ident}`
    })
    .join('\n')
}

export function buildBibtex(cards: SummaryCard[]): string {
  if (cards.length === 0) return ''
  return (
    cards
      .map((card) => {
        const key = `research${card.id}`
        const fields: string[] = [
          `  title = {${escapeLatex(card.title)}}`,
          `  author = {${card.authors ? escapeLatex(card.authors) : 'Unknown'}}`,
        ]
        if (card.year) fields.push(`  year = {${card.year}}`)
        if (card.doi) fields.push(`  doi = {${card.doi}}`)
        if (card.arxivId) fields.push(`  eprint = {${card.arxivId}}`)
        if (card.url && !card.doi) fields.push(`  url = {${card.url}}`)
        return `@article{${key},\n${fields.join(',\n')},\n}\n`
      })
      .join('\n')
  )
}

export type ReferenceStyle = 'apa' | 'gbt'

/**
 * 生成 APA 风格参考文献（best-effort）：作者（年份）. 标题. 来源标识（DOI/URL）.
 * 作者为语料自带的显示字符串，不做首字母缩写反转，避免误解析。
 */
export function buildReferencesApa(cards: SummaryCard[]): string {
  if (cards.length === 0) return '（无卡片）'
  return cards.map((card) => {
    const authors = card.authors || 'Unknown'
    const year = card.year ? `(${card.year}).` : '(n.d.).'
    const source = citationSource(card)
    return `${authors} ${year} ${card.title}. ${source ? source + '.' : ''}`.trim()
  }).join('\n')
}

/**
 * 生成 GB/T 7714-2015 风格参考文献（顺序编码制，best-effort）。
 */
export function buildReferencesGbt(cards: SummaryCard[]): string {
  if (cards.length === 0) return '（无卡片）'
  return cards.map((card) => {
    const authors = card.authors ? abbreviateAuthors(card.authors) : '佚名'
    const year = card.year ?? ''
    const title = `${card.title}[J].`
    const source = citationSource(card)
    return `[${card.id}] ${authors}. ${title} ${year}. ${source}.`.replace(/\s+/g, ' ').trim()
  }).join('\n')
}

export function buildReferences(cards: SummaryCard[], style: ReferenceStyle): string {
  return style === 'apa' ? buildReferencesApa(cards) : buildReferencesGbt(cards)
}

function citationSource(card: SummaryCard): string {
  return (
    (card.doi ? `https://doi.org/${card.doi}` : null) ??
    (card.url ?? null) ??
    (card.arxivId ? `arXiv:${card.arxivId}` : null) ??
    ''
  )
}

function abbreviateAuthors(authors: string): string {
  const parts = authors.split(/[;,，]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length > 3) return `${parts[0]} 等`
  return parts.length > 0 ? parts.join('；') : authors
}

export function buildSummary(cardsMd: string, planMd: string): string {
  const cards = parseSummaryCards(cardsMd)
  const high = cards.filter((card) => card.level === 'high').length
  const partial = cards.filter((card) => card.level === 'partial').length
  const groups = buildTopicGroups(cards, planMd)
  const lines = [
    '# 调研结果摘要（结构化）',
    '',
    `- 证据卡片：${cards.length} 篇（高相关 ${high} / 部分相关 ${partial}）`,
    '',
    '## 主题分组',
    '',
  ]
  for (const group of groups) {
    const primary = group.primary.map((id) => `[${id}]`).join('、')
    const related =
      group.related.length > 0
        ? `（相关：${group.related.map((id) => `[${id}]`).join('、')}）`
        : ''
    lines.push(`### ${group.concept}`, `- 主组：${primary || '（无）'}${related}`, '')
  }
  if (cards.length === 0) {
    lines.push('（无证据卡片，无法归纳）')
  }
  lines.push(
    '## 相关度分级',
    '',
    `- 高相关（${high}）：${cards.filter((card) => card.level === 'high').map((card) => `[${card.id}]`).join('、') || '（无）'}`,
    `- 部分相关（${partial}）：${cards.filter((card) => card.level === 'partial').map((card) => `[${card.id}]`).join('、') || '（无）'}`,
    '',
    '## 引用清单',
    '',
    buildReferencesMd(cards),
    '',
    '> 完整 BibTeX 见 references.bib（仅含必填字段，缺失字段不编造）。',
  )
  return lines.join('\n')
}

function extractSectionItems(md: string, header: string): string[] {
  const lines = md.split('\n')
  const start = lines.findIndex((line) => line.includes(header))
  if (start < 0) return []
  const items: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) break
    const line = lines[i].trim()
    if (/^[-*•]\s+/.test(line) || /^\d+[.)、]\s*/.test(line)) items.push(line)
  }
  return items
}

function match(text: string, pattern: RegExp): string | null {
  const found = text.match(pattern)
  return found ? found[1].trim() : null
}

function escapeLatex(text: string): string {
  return text.replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}')
}
