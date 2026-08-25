import type { Step } from '@research-workbench/shared'
import {
  Check,
  Filter,
  LayoutGrid,
  ListChecks,
  PenLine,
  Scale,
  Search,
  ShieldCheck,
  Compass,
} from 'lucide-react'
import { cn } from '../lib/cn'

const ROLE_LABELS: Record<Step['role'], string> = {
  planner: '规划',
  researcher: '检索',
  selector: '筛选',
  writer: '写作',
  evaluator: '评估',
  reviewer: '审查',
  summarizer: '归纳',
}

const ROLE_ICONS: Record<Step['role'], typeof Compass> = {
  planner: Compass,
  researcher: Search,
  selector: Filter,
  writer: PenLine,
  evaluator: Scale,
  reviewer: ShieldCheck,
  summarizer: LayoutGrid,
}

type VisualState = 'done' | 'current' | 'wait' | 'bad'

function visualState(step: Step): VisualState {
  if (step.status === 'failed' || step.status === 'rejected') return 'bad'
  if (step.status === 'approved') return 'done'
  if (step.status === 'running' || step.status === 'awaiting_approval') return 'current'
  return 'wait'
}

function statusText(step: Step): { label: string; class: string } {
  switch (step.status) {
    case 'running':
      return { label: '进行中', class: 'text-run' }
    case 'awaiting_approval':
      return { label: '待你审批', class: 'text-warn' }
    case 'approved':
      return { label: '已通过', class: 'text-ok' }
    case 'rejected':
      return { label: '已打回', class: 'text-bad' }
    case 'skipped':
      return { label: '跳过', class: 'text-ink3' }
    case 'failed':
      return { label: '失败', class: 'text-bad' }
    default:
      return { label: '排队', class: 'text-ink3' }
  }
}

export function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-6 max-w-[760px]">
      {steps.map((step, index) => {
        const state = visualState(step)
        const Icon = ROLE_ICONS[step.role]
        const status = statusText(step)
        return (
          <li
            key={step.id}
            className={cn(
              'relative flex gap-3.5 rounded-(--radius) px-4 py-3',
              state === 'current' &&
                'border border-accent-line bg-gradient-to-r from-accent/7 to-accent/2 shadow-(--shadow-soft)'
            )}
          >
            {steps.length > 1 && index < steps.length - 1 && (
              <span className="absolute left-[27px] top-11 bottom-[-6px] w-[1.5px] bg-gradient-to-b from-line-strong to-line-soft" />
            )}
            {state === 'current' && (
              <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-accent" />
            )}
            <span
              className={cn(
                'z-[1] grid size-7 flex-none place-items-center rounded-[9px] border shadow-(--shadow-soft)',
                state === 'done' && 'border-ok-line bg-ok-soft text-ok',
                state === 'current' && 'border-accent bg-accent text-white ring-4 ring-accent-soft',
                state === 'wait' && 'border-line-strong bg-surface text-ink3',
                state === 'bad' && 'border-bad-line bg-bad-soft text-bad'
              )}
            >
              {(state === 'done' || state === 'bad') && !(state === 'bad' && step.status === 'rejected') ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              ) : step.status === 'running' ? (
                <span className="size-3 animate-spin rounded-full border-2 border-accent-line border-t-accent" />
              ) : (
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-semibold tracking-[-.005em] text-ink">
                  {ROLE_LABELS[step.role]}
                </span>
                <span className={cn('text-[11px] font-semibold', status.class)}>{status.label}</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-ink2">{step.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
