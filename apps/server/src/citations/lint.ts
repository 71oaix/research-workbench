export function extractCitationIds(md: string): number[] {
  const ids: number[] = []
  const pattern = /\[(\d{1,4})\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(md))) {
    const id = Number(match[1])
    if (Number.isFinite(id) && id > 0) {
      ids.push(id)
    }
  }
  return ids
}

export function buildCitationLint(draft: string, cardIds: number[]): string {
  const ids = extractCitationIds(draft)
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

  return lines.join('\n')
}
