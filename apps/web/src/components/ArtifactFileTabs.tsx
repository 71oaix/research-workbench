import type { Artifact, Step } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { IconFile, IconPlan, IconSearch, IconShield, IconPen, IconFilter } from './icons'

const ORDER = [
  { name: '01-plan.md', label: '检索计划', icon: IconPlan },
  { name: 'research-candidates.md', label: '候选论文', icon: IconSearch },
  { name: '02-research.md', label: '文献清单', icon: IconSearch },
  { name: 'research-cards.md', label: '证据卡片', icon: IconFilter },
  { name: '03-draft.md', label: '综述初稿', icon: IconPen },
  { name: 'evaluation-report.md', label: '评估报告', icon: IconPen },
  { name: '04-review.md', label: '审查意见', icon: IconShield },
  { name: '05-summary.md', label: '调研摘要', icon: IconPlan },
]

export function ArtifactFileTabs({ artifacts, steps }: { artifacts: Artifact[]; steps: Step[] }) {
  const authored = new Set(artifacts.map((artifact) => artifact.name))
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.11em] text-ink3">产出文件</div>
      <div className="space-y-0.5">
        {ORDER.map((item) => {
          if (!authored.has(item.name)) return null
          const RowIcon = item.icon
          const step = steps.find((candidate) => outputName(candidate) === item.name)
          const parts = artifacts.filter((artifact) => artifact.name === item.name)
          const versions = new Set(parts.map((p) => p.version)).size
          return (
            <button
              key={item.name}
              onClick={() => {
                const id = step?.id ?? parts[0]?.stepId ?? undefined
                if (id) document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left text-[13px] text-ink2 transition-colors hover:bg-surface2"
            >
              <span className="grid size-6 flex-none place-items-center rounded-[7px] bg-surface2 text-ink3">
                <RowIcon size={13} />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {versions > 1 && <span className="flex-none text-[11px] text-ink3">v{versions}</span>}
            </button>
          )
        })}
        {!ORDER.some((item) => authored.has(item.name)) && (
          <div className="px-2 py-3 text-[12px] text-ink3">产物会随步骤推进生成。</div>
        )}
      </div>
    </div>
  )
}

function outputName(step: Step): string {
  return {
    planner: '01-plan.md', researcher: '02-research.md', selector: 'research-cards.md',
    writer: '03-draft.md', evaluator: 'evaluation-report.md', reviewer: '04-review.md', summarizer: '05-summary.md',
  }[step.role] ?? ''
}
