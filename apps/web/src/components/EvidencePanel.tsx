import type { Artifact } from '@research-workbench/shared'
import { Activity, FileSearch, Scale, ShieldCheck } from 'lucide-react'

export function EvidencePanel({ artifacts }: { artifacts: Artifact[] }) {
  const cards = artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const lint = artifacts.find((artifact) => artifact.name === 'citation-lint.md')
  const evaluation = artifacts.find((artifact) => artifact.name === 'evaluation-report.md')
  const review = artifacts.find((artifact) => artifact.name === '04-review.md')

  const hit = extractLine(cards?.content ?? '', '命中 / 去重')
  const failed = extractLine(cards?.content ?? '', '失败源')
  const citeOk = extractLine(lint?.content ?? '', '有效引用编号')
  const citeBad = extractLine(lint?.content ?? '', '越界 / 缺失编号')
  const topic = extractLine(evaluation?.content ?? '', '主题匹配')
  const coverage = extractLine(evaluation?.content ?? '', '大纲覆盖')
  const reviewSummary = review ? summarizeReview(review.content) : null

  const items = [
    { icon: Activity, label: '检索', value: hit ?? '-' },
    { icon: FileSearch, label: '引用', value: citeOk ? `${citeOk}${citeBad ? ' / 异常 ' + citeBad : ''}` : '-' },
    { icon: Scale, label: '评估', value: topic ? `${topic}${coverage ? ' · ' + coverage : ''}` : '-' },
    { icon: ShieldCheck, label: '审查', value: reviewSummary ?? '-' },
  ]
  void failed

  return (
    <div className="shrink-0 border-b border-line bg-surface2/60 px-4 py-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[11.5px] text-ink3">
            <item.icon className="size-3.5" strokeWidth={1.8} />
            <span>{item.label}</span>
            <span className="num max-w-[150px] truncate font-semibold text-ink2">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function summarizeReview(content: string): string | null {
  const blocking = (content.match(/blocking:\s*yes/gi) ?? []).length
  const major = (content.match(/severity:\s*major/gi) ?? []).length
  const minor = (content.match(/severity:\s*minor/gi) ?? []).length
  if (blocking === 0 && major === 0 && minor === 0) return null
  return `B${blocking} M${major} m${minor}`
}

function extractLine(content: string, key: string): string | null {
  const line = content.split('\n').find((item) => item.includes(key))
  return line?.trim() ?? null
}
