import type { Step } from '@research-workbench/shared'
import { useEffect, useState } from 'react'
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

const PHRASES: Record<Step['role'], string[]> = {
  planner: ['正在拆解问题…', '正在锚定方向…', '正在勾勒检索蓝图…'],
  researcher: ['正在翻阅浩瀚文献…', '正在检索领域要义…', '正在比对候选…', '正在甄选关键工作…'],
  selector: ['正在逐篇审视…', '正在权衡相关性…', '正在剔除噪音…'],
  writer: ['正在构思综述…', '正在落笔成章…', '正在编织证据…'],
  evaluator: ['正在评估证据…', '正在核对覆盖…'],
  reviewer: ['正在核验引用…', '正在审查可信度…'],
  summarizer: ['正在归纳成果…', '正在收束成稿…'],
}

function CyclingLabel({ role }: { role: Step['role'] }) {
  const phrases = PHRASES[role]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (phrases.length < 2) return
    const timer = setInterval(() => setI((index) => (index + 1) % phrases.length), 2200)
    return () => clearInterval(timer)
  }, [phrases.length])
  return (
    <span key={i} className="animate-[label-fade_0.5s_ease-out] text-run">
      {phrases[i]}
    </span>
  )
}

export function ProgressRail({ steps, workflowStatus }: { steps: Step[]; workflowStatus: string }) {
  const visible = steps.filter((step) => step.status !== 'pending')
  return (
    <div className="border-b border-line px-3.5 py-4">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.11em] text-ink3">执行进度</div>
      <div className="space-y-0.5">
        {visible.map((step) => {
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
                'flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors',
                current ? 'bg-accent-soft font-semibold text-ink' : 'text-ink2 hover:bg-surface2'
              )}
            >
              <span
                className={cn(
                  'grid size-6 flex-none place-items-center rounded-[7px] border',
                  done && 'border-ok-line bg-ok-soft text-ok',
                  current && 'border-accent bg-accent text-white',
                  !done && !current && 'border-line-strong text-ink3'
                )}
              >
                {done ? <IconCheck size={13} /> : <Icon size={13} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
              {step.status === 'running' ? (
                <CyclingLabel role={step.role} />
              ) : (
                <span className={cn('flex-none text-[11px]', s.cls)}>{s.label}</span>
              )}
            </button>
          )
        })}
        {visible.length === 0 && (
          <div className="px-2 py-2 text-[12px] text-ink3">尚未开始。</div>
        )}
      </div>
    </div>
  )
}
