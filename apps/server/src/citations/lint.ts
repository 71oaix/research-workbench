export type CitationKind = 'plain' | 'prefixed'

export interface CitationRef {
  id: number | null
  raw: string
  kind: CitationKind
}

export function extractCitationRefs(md: string): CitationRef[] {
  const refs: CitationRef[] = []
  const pattern = /\[(V\d+-)?(\d{1,4})\]/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(md))) {
    const id = Number(match[2])
    if (!Number.isFinite(id) || id <= 0) continue
    refs.push({ id, raw: match[0], kind: match[1] ? 'prefixed' : 'plain' })
  }
  return refs
}

export function extractCitationIds(md: string): number[] {
  return extractCitationInfo(md).ids
}

export function extractCitationInfo(md: string): { ids: number[]; prefixed: boolean } {
  const refs = extractCitationRefs(md)
  return {
    ids: refs.map((ref) => ref.id).filter((id): id is number => id !== null),
    prefixed: refs.some((ref) => ref.kind === 'prefixed'),
  }
}

export function buildCitationLint(draft: string, cardIds: number[]): string {
  const info = extractCitationInfo(draft)
  const ids = info.ids
  const cardSet = new Set(cardIds)
  const citedUnique = [...new Set(ids)]
  const valid = citedUnique.filter((id) => cardSet.has(id))
  const invalid = citedUnique.filter((id) => !cardSet.has(id))

  const counts = new Map<number, number>()
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const cardRange =
    cardIds.length > 0
      ? `${Math.min(...cardIds)}-${Math.max(...cardIds)}`
      : '（空）'

  const lines = [
    '# 引用检查报告',
    '',
    `- 草稿引用次数：${ids.length}`,
    `- 去重后引用编号：${citedUnique.length}`,
    `- 证据卡片编号范围：${cardRange}`,
    `- 有效引用编号：${valid.join(', ') || '（无）'}`,
    `- 越界 / 缺失编号：${invalid.join(', ') || '（无）'}`,
    info.prefixed ? '- 格式提示：检测到 [V1-n] 形式引用，已归一化为编号' : '',
    '',
    '## 引用频次',
    ...[...counts.entries()].map(([id, count]) => `- [${id}]：${count} 次`),
    '',
    '## 结论',
    ids.length === 0
      ? '草稿中未发现 [编号] 引用，请 Reviewer 重点核查覆盖度与证据使用。'
      : invalid.length === 0
        ? '所有引用编号均在证据卡片范围内。'
        : `存在 ${invalid.length} 个不在卡片范围内的引用编号，请 Reviewer 核查。`,
  ]

  return lines.filter((line) => line !== '').join('\n')
}
