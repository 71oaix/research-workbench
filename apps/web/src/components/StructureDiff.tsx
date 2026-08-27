interface DiffSummary {
  removedHeads: string[]
  addedHeads: string[]
  removedRefs: string[]
  addedRefs: string[]
}

export function structureDiff(prev: string, next: string): DiffSummary {
  const prevHeads = headings(prev)
  const nextHeads = headings(next)
  const prevRefs = refs(prev)
  const nextRefs = refs(next)
  return {
    removedHeads: prevHeads.filter((heading) => !nextHeads.includes(heading)),
    addedHeads: nextHeads.filter((heading) => !prevHeads.includes(heading)),
    removedRefs: prevRefs.filter((ref) => !nextRefs.includes(ref)),
    addedRefs: nextRefs.filter((ref) => !prevRefs.includes(ref)),
  }
}

export function StructureDiff({ prev, next }: { prev: string; next: string }) {
  const diff = structureDiff(prev, next)
  const noChange =
    diff.removedHeads.length === 0 &&
    diff.addedHeads.length === 0 &&
    diff.removedRefs.length === 0 &&
    diff.addedRefs.length === 0
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-bold text-ink">结构差异（上一版 → 当前版）</div>
      {diff.removedHeads.length > 0 && (
        <p className="text-[12.5px] text-ink2">移除章节：{diff.removedHeads.join('；')}</p>
      )}
      {diff.addedHeads.length > 0 && (
        <p className="text-[12.5px] text-ink2">新增章节：{diff.addedHeads.join('；')}</p>
      )}
      {diff.removedRefs.length > 0 && (
        <p className="text-[12.5px] text-ink2">不再引用的编号：{diff.removedRefs.join(', ')}</p>
      )}
      {diff.addedRefs.length > 0 && (
        <p className="text-[12.5px] text-ink2">新增引用的编号：{diff.addedRefs.join(', ')}</p>
      )}
      {noChange && <p className="text-[12.5px] text-ink2">章节结构无变化</p>}
    </div>
  )
}

function headings(md: string): string[] {
  return (md.match(/^#{2,3} .+$/gm) ?? []).map((heading) => heading.replace(/^#+\s*/, '').trim())
}

function refs(md: string): string[] {
  return [...new Set([...md.matchAll(/\[(\d{1,4})\]/g)].map((match) => match[1]))]
}
