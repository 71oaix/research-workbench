import { useMemo } from 'react'

export type CiteStatus = 'verified' | 'warn' | 'bad' | 'unknown'

export interface CiteMeta {
  title: string
  year: string
  status: CiteStatus
  confidence?: string
}

const STATUS_MAP: Record<string, CiteStatus> = {
  verified: 'verified',
  check_suggested: 'warn',
  needs_fix: 'bad',
  unverifiable: 'unknown',
}

/**
 * 解析 citation-verification.md 的逐条核验表格（5 列：编号/状态/级别/置信度/摘要）。
 * 编号单元格可能是 `[V1-3]（归一化为 [3]）`，优先取归一化编号；不合规行静默跳过。
 */
export function parseVerificationTable(md: string | null | undefined): Map<number, CiteMeta> {
  const out = new Map<number, CiteMeta>()
  if (!md) return out
  for (const line of md.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    const idCell = cells[1] ?? ''
    const ids = idCell.match(/\[(\d{1,4})\]/g)
    if (!ids) continue
    const normalized = idCell.match(/归一化为\s*\[?(\d{1,4})\]?/)
    const id = normalized ? Number(normalized[1]) : Number(ids[0].slice(1, -1))
    if (Number.isNaN(id)) continue
    const status = STATUS_MAP[(cells[2] ?? '').toLowerCase()] ?? 'unknown'
    const confidence = /^\d+(\.\d+)?$/.test(cells[4] ?? '') ? cells[4] : undefined
    const existing = out.get(id)
    // 同编号多行时保留最强结论（bad > warn > verified > unknown）
    if (existing && rank(existing.status) >= rank(status)) continue
    out.set(id, { title: '', year: '', status, confidence })
  }
  return out
}

function rank(status: CiteStatus): number {
  return { bad: 3, warn: 2, verified: 1, unknown: 0 }[status]
}
