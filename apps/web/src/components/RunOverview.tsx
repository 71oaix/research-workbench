import { useEffect, useMemo, useState } from 'react'
import type { Artifact, Step, UsageSummary, Workflow } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { expandStep } from './ChatFlow'
import { parseCards } from './PaperCards'
import { IconCheck, IconChevron } from './icons'

const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  researcher: '检索',
  selector: '筛选',
  writer: '写作',
  evaluator: '评估',
  reviewer: '审查',
  summarizer: '归纳',
}

type NodeState = 'done' | 'running' | 'awaiting' | 'failed' | 'pending'

function nodeState(step: Step, wfStatus: string): NodeState {
  const waiting = wfStatus === 'paused' || wfStatus === 'planning'
  if (step.status === 'running') return 'running'
  if (step.status === 'awaiting_approval') return waiting ? 'awaiting' : 'done'
  if (step.status === 'approved') return 'done'
  if (step.status === 'failed' || step.status === 'rejected') return 'failed'
  return 'pending'
}

const NODE_CLS: Record<NodeState, string> = {
  done: 'border-ok bg-ok text-white',
  running: 'border-accent bg-accent text-white animate-pulse',
  awaiting: 'border-warn bg-warn text-white',
  failed: 'border-bad bg-bad text-white',
  pending: 'border-line-strong bg-surface text-ink3',
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} 时 ${m} 分`
  if (m > 0) return `${m} 分 ${String(s).padStart(2, '0')} 秒`
  return `${s} 秒`
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** 累计耗时：executing 时每秒走表；终态停在 updatedAt */
function useElapsed(workflow: Workflow): string {
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    if (workflow.status !== 'executing') return
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [workflow.status])
  const end =
    workflow.status === 'executing' ? nowTs : new Date(workflow.updatedAt).getTime()
  const start = new Date(workflow.createdAt).getTime()
  return useMemo(
    () => fmtDuration(end - start),
    [end, start]
  )
}

export function RunOverview({
  workflow,
  steps,
  artifacts,
  decisions,
  usageSummary,
}: {
  workflow: Workflow
  steps: Step[]
  artifacts: Artifact[]
  decisions: { id: string }[]
  usageSummary: UsageSummary[]
}) {
  const elapsed = useElapsed(workflow)
  const [detailOpen, setDetailOpen] = useState(false)

  // 成本按角色聚合（summary 按 step+role 分行，同角色多轮迭代会多行）
  const byRole = useMemo(() => {
    const map = new Map<string, { calls: number; input: number; output: number; cost: number }>()
    for (const row of usageSummary) {
      const key = row.role ?? 'other'
      const prev = map.get(key) ?? { calls: 0, input: 0, output: 0, cost: 0 }
      map.set(key, {
        calls: prev.calls + row.calls,
        input: prev.input + row.inputTokens,
        output: prev.output + row.outputTokens,
        cost: prev.cost + row.costCny,
      })
    }
    return [...map.entries()]
  }, [usageSummary])
  const totals = useMemo(
    () =>
      byRole.reduce(
        (acc, [, v]) => ({
          calls: acc.calls + v.calls,
          input: acc.input + v.input,
          output: acc.output + v.output,
          cost: acc.cost + v.cost,
        }),
        { calls: 0, input: 0, output: 0, cost: 0 }
      ),
    [byRole]
  )

  // 资产：论文数取最新 research-cards 的卡片数；覆盖矩阵看产物有无
  const paperCount = useMemo(() => {
    const cards = artifacts.filter((a) => a.name === 'research-cards.md').at(-1)
    return cards ? parseCards(cards.content).length : 0
  }, [artifacts])
  const hasCoverage = artifacts.some((a) => a.name === 'coverage-matrix.md')

  // 当前步骤与文案
  const active =
    steps.find((s) => s.status === 'running') ??
    steps.find((s) => s.status === 'awaiting_approval') ??
    null
  const statusLine = useMemo(() => {
    const wf = workflow.status
    if (wf === 'planning') return { text: '待启动', cls: 'text-ink2' }
    if (wf === 'paused' && active)
      return { text: `等待你的审批：${active.label}`, cls: 'text-warn font-semibold' }
    if (wf === 'executing' && active)
      return { text: `进行中：${active.label}`, cls: 'text-run' }
    if (wf === 'completed') return { text: '已完成', cls: 'text-ok' }
    if (wf === 'cancelled') return { text: '已取消', cls: 'text-ink2' }
    if (wf === 'failed') return { text: '失败', cls: 'text-bad' }
    return { text: '—', cls: 'text-ink2' }
  }, [workflow.status, active])

  return (
    <div className="border-b border-line px-3.5 py-4">
      <div className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[.11em] text-ink3">
        运行总览
      </div>

      {/* 状态机：节点间连线，已走过的段落着色 */}
      <div className="flex items-center">
        {steps.map((step, i) => {
          const state = nodeState(step, workflow.status)
          return (
            <div key={step.id} className={cn('flex items-center', i > 0 && 'flex-1')}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px min-w-1 flex-1',
                    nodeState(steps[i - 1], workflow.status) === 'done' ? 'bg-ok-line' : 'bg-line'
                  )}
                />
              )}
              <button
                title={`${step.label}（${ROLE_LABEL[step.role] ?? step.role}）`}
                aria-label={`${step.label}，${state === 'done' ? '已通过' : state === 'running' ? '进行中' : state === 'awaiting' ? '待审批' : state === 'failed' ? '失败' : '排队'}`}
                onClick={() => {
                  expandStep(step.id)
                  document
                    .getElementById(`step-${step.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={cn(
                  'grid size-5 flex-none place-items-center rounded-full border transition-colors',
                  NODE_CLS[state]
                )}
              >
                {state === 'done' && <IconCheck size={11} />}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-2.5 flex items-baseline gap-1.5 text-[13px]">
        <span className={cn('min-w-0 flex-1 truncate', statusLine.cls)}>{statusLine.text}</span>
        <span className="num flex-none text-[12px] text-ink3">{elapsed}</span>
      </div>

      {/* 成本 */}
      <div className="mt-3.5 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px]">
            <span className="num font-bold text-ink">¥{totals.cost.toFixed(2)}</span>
            <span className="ml-2 text-[12px] text-ink2">
              <span className="num font-semibold text-ink2">{totals.calls}</span> 次调用
            </span>
          </div>
          <div className="text-[12px] text-ink3">
            输入 <span className="num">{fmtTokens(totals.input)}</span> · 输出{' '}
            <span className="num">{fmtTokens(totals.output)}</span>
          </div>
        </div>
        {byRole.length > 0 && (
          <>
            <button
              onClick={() => setDetailOpen((v) => !v)}
              aria-expanded={detailOpen}
              className="mt-1 flex w-full items-center gap-1 text-[12px] text-ink3 transition-colors hover:text-ink2"
            >
              <IconChevron
                size={12}
                className={cn('transition-transform', detailOpen && 'rotate-90')}
              />
              按角色明细
            </button>
            {detailOpen && (
              <div className="mt-1.5 space-y-1">
                {byRole.map(([role, v]) => (
                  <div key={role} className="flex items-center justify-between text-[12px] text-ink2">
                    <span className="flex-1">{ROLE_LABEL[role] ?? role}</span>
                    <span className="num text-ink3">
                      ¥{v.cost.toFixed(2)} · {v.calls} 次
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 资产 */}
      <div className="mt-3 border-t border-line pt-3 text-[13px] text-ink2">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span>
            论文 <strong className="num font-bold text-ink">{paperCount}</strong>
          </span>
          <span className="text-ink3">·</span>
          <span>
            产物 <strong className="num font-bold text-ink">{artifacts.length}</strong>
          </span>
          <span className="text-ink3">·</span>
          <span>
            决策 <strong className="num font-bold text-ink">{decisions.length}</strong>
          </span>
          <span className="text-ink3">·</span>
          <span className={cn(hasCoverage ? 'text-ok' : 'text-ink3')}>
            覆盖矩阵 {hasCoverage ? '✓' : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
