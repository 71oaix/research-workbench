import { useEffect, useMemo, useState } from 'react'
import type { Artifact, Step, UsageSummary, Workflow } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { fmtDuration, fmtTokens } from '../lib/format'
import { parseCards } from './PaperCards'
import { IconBook, IconCheck, IconFile, IconFilter, IconScale } from './icons'

const ROLE_LABEL: Record<string, string> = {
  planner: '规划',
  researcher: '检索',
  selector: '筛选',
  writer: '写作',
  evaluator: '评估',
  reviewer: '审查',
  summarizer: '归纳',
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
  return useMemo(() => fmtDuration(end - start), [end, start])
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

  // 成本按角色聚合（summary 按 step+role 分行，同角色多轮迭代会多行），按金额降序
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
      .map(
        ([role, v]) =>
          [role, { ...v, display: Math.round(v.cost * 100) / 100 }] as const
      )
      .filter(([, v]) => v.display > 0)
      .sort((a, b) => b[1].cost - a[1].cost)
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
  // 条形宽度相对最大角色金额（最长条 = 最贵角色）
  const maxCost = byRole[0]?.[1].cost ?? 0

  // 资产：论文数取最新 research-cards 的卡片数；覆盖矩阵看产物有无
  const paperCount = useMemo(() => {
    const cards = artifacts.filter((a) => a.name === 'research-cards.md').at(-1)
    return cards ? parseCards(cards.content).length : 0
  }, [artifacts])
  const coverage = artifacts.find((a) => a.name === 'coverage-matrix.md')

  return (
    <div className="border-b border-line px-3.5 py-4">
      <div className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[.11em] text-ink3">
        运行总览
      </div>

      <div className="flex items-baseline gap-1.5 text-[13px]">
        <span className={cn('min-w-0 flex-1 truncate', statusLine.cls)}>{statusLine.text}</span>
        <span className="num flex-none text-[12px] text-ink3">{elapsed}</span>
      </div>

      {/* 成本：大数字 + 按角色条形排行 */}
      <div className="mt-3.5 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num font-serif text-[22px] font-semibold leading-none tracking-[-.01em] text-ink">
            ¥{totals.cost.toFixed(2)}
          </span>
          <span className="num text-[12px] text-ink2">{totals.calls} 次调用</span>
        </div>
        <div className="num mt-1 text-[12px] text-ink3">
          输入 {fmtTokens(totals.input)} · 输出 {fmtTokens(totals.output)}
        </div>
        {byRole.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {byRole.map(([role, v]) => (
              <div
                key={role}
                title={`${ROLE_LABEL[role] ?? role}：¥${v.display.toFixed(2)} · ${v.calls} 次调用`}
                className="group flex items-center gap-2 text-[12px]"
              >
                <span className="w-7 flex-none text-ink2">{ROLE_LABEL[role] ?? role}</span>
                <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
                  <span
                    className="block h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.max(4, (v.cost / maxCost) * 100)}%` }}
                  />
                </span>
                <span className="num w-11 flex-none text-right text-ink3 group-hover:text-ink2">
                  ¥{v.display.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 资产 */}
      <div className="mt-3 border-t border-line pt-3 text-[13px] text-ink2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <IconBook size={13} className="text-ink3" />
            <span className="num font-semibold text-ink">{paperCount}</span> 论文
          </span>
          <span className="inline-flex items-center gap-1">
            <IconFile size={13} className="text-ink3" />
            <span className="num font-semibold text-ink">{artifacts.length}</span> 产物
          </span>
          <span className="inline-flex items-center gap-1">
            <IconScale size={13} className="text-ink3" />
            <span className="num font-semibold text-ink">{decisions.length}</span> 决策
          </span>
          <button
            onClick={() => {
              if (!coverage) return
              const stepId = coverage.stepId
              if (stepId) {
                document
                  .getElementById(`step-${stepId}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            }}
            disabled={!coverage}
            className={cn(
              'inline-flex items-center gap-1',
              coverage ? 'text-ok hover:text-ink' : 'cursor-default text-ink3'
            )}
          >
            <IconFilter size={13} />
            覆盖矩阵 {coverage ? <IconCheck size={11} /> : '—'}
          </button>
        </div>
      </div>
    </div>
  )
}
