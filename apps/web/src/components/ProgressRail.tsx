import type { Step } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { IconCheck, IconFilter, IconPen, IconPlan, IconScale, IconSearch, IconShield } from './icons'

const ICONS: Record<Step['role'], (s: { size?: number }) => ReturnType<typeof IconPlan>> = {
  planner: IconPlan, researcher: IconSearch, selector: IconFilter, writer: IconPen,
  evaluator: IconScale, reviewer: IconShield, summarizer: IconPlan,
}

function status(step: Step, wf: string): { label: string; cls: string } {
  const awaiting = wf === 'paused' || wf === 'planning'
  if (step.status === 'awaiting_approval') return awaiting ? { label: '待审批', cls: 'text-warn' } : { label: '已通过', cls: 'text-ok' }
  if (step.status === 'approved') return { label: '已通过', cls: 'text-ok' }
  if (step.status === 'running') return { label: '进行中', cls: 'text-run' }
  if (step.status === 'failed' || step.status === 'rejected') return { label: step.status === 'failed' ? '失败' : '已打回', cls: 'text-bad' }
  if (step.status === 'skipped') return { label: '跳过', cls: 'text-ink3' }
  return { label: '排队', cls: 'text-ink3' }
}

export function ProgressRail({ steps, workflowStatus }: { steps: Step[]; workflowStatus: string }) {
  return (
    <div className="border-b border-line px-3.5 py-4">
      <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[.11em] text-ink3">执行进度</div>
      <div className="space-y-0.5">
        {steps.map((step) => {
          const Icon = ICONS[step.role]
          const s = status(step, workflowStatus)
          const current = s.label === '进行中' || s.label === '待审批'
          const done = s.label === '已通过'
          return (
            <button
              key={step.id}
              onClick={() =>
                document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[14px] transition-colors',
                current ? 'bg-accent-soft font-semibold text-ink' : 'text-ink2 hover:bg-surface2'
              )}
            >
              <span
                className={cn(
                  'grid size-6 flex-none place-items-center rounded-[9px] border',
                  done && 'border-ok-line bg-ok-soft text-ok',
                  current && 'border-accent bg-accent text-white',
                  !done && !current && 'border-line-strong text-ink3'
                )}
              >
                {done ? <IconCheck size={13} /> : <Icon size={13} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
              <span className={cn('flex-none text-[12px]', s.cls)}>{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
