export type ConcernSeverity = 'major' | 'minor'

export interface Concern {
  id: string
  severity: ConcernSeverity
  blocking: boolean
  claim: string
  evidence: string
  resolution: string
}

export interface ConcernSummary {
  total: number
  blocking: number
  major: number
  minor: number
}

export function parseConcernLedger(md: string): Concern[] {
  const concerns: Concern[] = []
  const header = /^###\s+(C\d+)\s*$/gm
  const blocks: { id: string; start: number; end: number }[] = []
  let match: RegExpExecArray | null
  while ((match = header.exec(md))) {
    blocks.push({ id: match[1], start: match.index, end: -1 })
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].end = i + 1 < blocks.length ? blocks[i + 1].start : md.length
    const block = md.slice(blocks[i].start, blocks[i].end)
    const claim = field(block, 'claim')
    if (!claim) continue
    const severityRaw = field(block, 'severity')
    const blockingRaw = field(block, 'blocking')
    concerns.push({
      id: blocks[i].id,
      severity: severityRaw === 'minor' ? 'minor' : 'major',
      blocking: blockingRaw === 'yes' || blockingRaw === 'true',
      claim,
      evidence: field(block, 'evidence') ?? '',
      resolution: field(block, 'resolution') ?? '',
    })
  }
  return concerns
}

export function summarizeConcerns(concerns: Concern[]): ConcernSummary {
  return {
    total: concerns.length,
    blocking: concerns.filter((concern) => concern.blocking).length,
    major: concerns.filter((concern) => concern.severity === 'major').length,
    minor: concerns.filter((concern) => concern.severity === 'minor').length,
  }
}

function field(block: string, key: string): string | null {
  const pattern = new RegExp(`^-\\s*${key}\\s*[:：]\\s*(.+)$`, 'mi')
  const found = block.match(pattern)
  return found ? found[1].trim() : null
}
