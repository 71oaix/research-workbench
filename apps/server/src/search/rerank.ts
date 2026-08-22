export interface RerankEntry {
  id: number
  score: number
  reason: string
}

/**
 * 从 selector 输出的"## 相关度排序"小节解析精排结果。
 * 容忍格式漂移：主格式 `| N | 分数 | 理由 |`，次格式 `- N: 分数 reason`。
 * 解析失败或行格式异常时跳过该行，不抛错。
 */
export function parseRerankReport(selectorMd: string): RerankEntry[] {
  const section = extractSection(selectorMd)
  if (!section) return []
  const entries: RerankEntry[] = []
  for (const line of section.split('\n')) {
    const row = parseRow(line)
    if (row) entries.push(row)
  }
  return entries.sort((a, b) => b.score - a.score)
}

export function buildRerankMd(entries: RerankEntry[]): string {
  if (entries.length === 0) {
    return '# 相关度排序\n\n（未解析到模型精排输出，按原候选顺序）\n'
  }
  const lines = [
    '# 相关度排序（模型精排）',
    '',
    '> 按与原研究问题的细粒度相关度从高到低；分数 0-100，仅作排序依据，不改变相关度分级。',
    '',
    '| 编号 | 分数 | 理由 |',
    '|------|------|------|',
    ...entries.map((entry) => `| [${entry.id}] | ${entry.score} | ${entry.reason} |`),
  ]
  return lines.join('\n')
}

function extractSection(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((line) => /相关度排序/.test(line))
  if (start < 0) return ''
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n')
}

function parseRow(line: string): RerankEntry | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('|') === false && !/^-|^\d/.test(trimmed)) return null
  // pipe table:  | N | score | reason |
  const pipe = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
  if (pipe.length >= 3) {
    const num = Number(pipe[0].replace(/[^0-9]/g, ''))
    const score = Number(pipe[1])
    if (Number.isFinite(num) && Number.isFinite(score)) {
      return { id: num, score: clampScore(score), reason: pipe.slice(2).join('｜') }
    }
  }
  // fallback:  - N: score reason  or  [N] score reason
  const match = trimmed.match(/^(?:-\s*)?(?:\[)?(\d{1,4})(?:\])?[：:.\s]+(\d{1,3}(?:\.\d+)?)[\s—–-]+(.+)$/)
  if (match) {
    return {
      id: Number(match[1]),
      score: clampScore(Number(match[2])),
      reason: match[3].trim(),
    }
  }
  return null
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}
