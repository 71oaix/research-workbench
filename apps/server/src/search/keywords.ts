import { SearchError } from './errors'
import type { KeywordGroup } from './types'

interface PlanSection {
  title: string
  items: string[]
}

export function extractKeywordGroups(planMd: string, maxGroups = 3): KeywordGroup[] {
  const sections = splitSections(planMd)
  const keywordsSection = sections.find((s) => /检索\s*关键词|搜索关键词|关键词/.test(s.title))
  let items = keywordsSection?.items ?? []

  if (items.length === 0) {
    const subQuestions = sections.find((s) => /子问题|子问题/.test(s.title))
    items = subQuestions?.items ?? []
  }

  const cleaned = items.map(cleanItem).filter((q): q is string => q.length > 0)
  const groups = dedupe(cleaned).slice(0, maxGroups)
  if (groups.length === 0) {
    throw new SearchError(
      '01-plan.md 中未找到“检索关键词”或“子问题”小节，无法生成检索查询'
    )
  }
  return groups.map((query, index) => ({ label: `g${index + 1}`, query }))
}

function splitSections(md: string): PlanSection[] {
  const sections: PlanSection[] = []
  let current: PlanSection | null = null
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim()
    if (/^#{1,3}\s+/.test(line)) {
      current = { title: line.replace(/^#{1,3}\s+/, ''), items: [] }
      sections.push(current)
      continue
    }
    if (!current) continue
    if (/^[-*]\s+/.test(line) || /^\d+[.)、]\s*/.test(line)) {
      current.items.push(line)
    }
  }
  return sections
}

function cleanItem(raw: string): string {
  return raw
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[*`]/g, '')
    .trim()
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)]
}
