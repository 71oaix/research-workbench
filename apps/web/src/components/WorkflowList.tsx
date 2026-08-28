import { useMemo, useState } from 'react'
import { useWorkflowStore } from '../store'
import { cn } from '../lib/cn'
import { EXAMPLE_GOALS } from '../lib/examples'
import { relativeTime, STATUS_DOT_FALLBACK, STATUS_LABEL, STATUS_META, WS_STATUS_META } from '../lib/labels'
import { IconBook, IconPlus, IconSpark, IconX } from './icons'

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'executing', label: '进行中' },
  { key: 'paused', label: '待审批' },
  { key: 'completed', label: '已完成' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

export function WorkflowList({ wsStatus }: { wsStatus: string }) {
  const workflows = useWorkflowStore((state) => state.workflows)
  const selectedId = useWorkflowStore((state) => state.selectedId)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)
  const selectWorkflow = useWorkflowStore((state) => state.selectWorkflow)
  const [goal, setGoal] = useState('')
  const [writing, setWriting] = useState(true)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = { all: workflows.length, executing: 0, paused: 0, completed: 0 }
    for (const workflow of workflows) {
      if (workflow.status === 'executing') result.executing += 1
      else if (workflow.status === 'paused') result.paused += 1
      else if (workflow.status === 'completed') result.completed += 1
    }
    return result
  }, [workflows])

  const visible = useMemo(() => {
    const keyword = query.trim()
    return workflows.filter(
      (workflow) =>
        (filter === 'all' || workflow.status === filter) &&
        (!keyword || workflow.goal.toLowerCase().includes(keyword.toLowerCase()))
    )
  }, [workflows, filter, query])

  async function handleCreate() {
    setCreating(true)
    await createWorkflow(goal, writing)
    setGoal('')
    setOpen(false)
    setCreating(false)
  }

  const wsMeta = WS_STATUS_META[wsStatus] ?? WS_STATUS_META.closed

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-line bg-sidebar px-3 pb-3 pt-5">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="grid h-8 w-8 place-items-center rounded-[11px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
          <IconBook size={17} />
        </div>
        <div className="leading-none">
          <div className="text-[16px] font-bold tracking-[.01em]">研镜</div>
          <div className="mt-1 font-serif text-[11px] italic tracking-[.02em] text-ink3">
            Research Workbench
          </div>
        </div>
      </div>

      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-(--radius) bg-accent py-2.5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
      >
        <IconPlus size={15} />
        新建调研
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[560px] rounded-(--radius-lg) border border-line-soft bg-surface p-5 shadow-(--shadow-lift) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[16px] font-bold tracking-[-.01em]">新的调研任务</div>
              <button
                aria-label="关闭"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-ink3 hover:bg-surface2 hover:text-ink"
              >
                <IconX size={16} />
              </button>
            </div>
            <p className="mb-3 text-[13px] text-ink2">输入研究问题，研镜会自动规划、检索、筛选、写作并核验引用。</p>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && goal.trim()) void handleCreate()
              }}
              placeholder="例如：研究下多智能体的记忆架构"
              className="w-full rounded-(--radius) border border-line-strong bg-bg px-3 py-2.5 text-[15px] outline-none placeholder:text-ink3 focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
              autoFocus
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {EXAMPLE_GOALS.map((value) => (
                <button
                  key={value}
                  onClick={() => setGoal(value)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-ink2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink2">
              <input
                type="checkbox"
                checked={writing}
                onChange={(event) => setWriting(event.target.checked)}
                className="size-3.5 accent-[#0c665b]"
              />
              包含综述写作（Writer）
            </label>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || goal.trim().length === 0}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-(--radius) bg-accent py-2.5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconSpark size={15} />
              创建并开始
            </button>
          </div>
        </div>
      )}

      {workflows.length > 0 && (
        <div className="mt-4 px-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && query.trim()) {
                setGoal(query.trim())
                setQuery('')
                setOpen(true)
              }
            }}
            aria-label="搜索工作流"
            placeholder="搜索工作流…"
            className="w-full rounded-(--radius) border border-line bg-surface px-2.5 py-1.5 text-[13.5px] outline-none placeholder:text-ink3 focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
          />
        </div>
      )}

      {workflows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1 px-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
              className={cn(
                'rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors',
                filter === item.key
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-ink2 hover:bg-white/60'
              )}
            >
              {item.label}
              <span className="num ml-1 text-[11px] text-ink3">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
        <div className="mb-3 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-[.11em] text-ink3">
          最近工作流
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {visible.map((workflow) => {
            const active = workflow.id === selectedId
            const statusText = STATUS_LABEL[workflow.status] ?? workflow.status
            return (
              <li key={workflow.id}>
                <button
                  onClick={() => void selectWorkflow(workflow.id)}
                  className={cn(
                    'flex w-full gap-2 rounded-(--radius) px-2.5 py-2.5 text-left transition-colors',
                    active
                      ? 'bg-white shadow-(--shadow-soft) shadow-[inset_2px_0_0_var(--color-accent)]'
                      : 'hover:bg-white/60'
                  )}
                >
                  <span
                    className={cn(
                      'mt-[7px] size-1.5 flex-none rounded-full',
                      STATUS_META[workflow.status]?.dot ?? STATUS_DOT_FALLBACK
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium leading-[1.5] text-ink">
                      {workflow.goal}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink3">
                      {relativeTime(workflow.createdAt)} · {statusText}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {workflows.length > 0 && visible.length === 0 && (
            <li className="px-2 py-3 text-[12.5px] text-ink3">无匹配结果，换个关键词试试。</li>
          )}
          {workflows.length === 0 && (
            <li className="px-2 py-6 text-center">
              <div className="mx-auto mb-2 grid size-9 place-items-center rounded-[12px] bg-surface text-ink3 shadow-(--shadow-soft)">
                <IconSpark size={16} />
              </div>
              <p className="text-[12.5px] text-ink2">还没有调研任务</p>
              <button
                onClick={() => setOpen(true)}
                className="mt-2 text-[12.5px] font-semibold text-accent hover:underline"
              >
                新建第一个调研 →
              </button>
            </li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line-soft px-2 pt-3 text-[12.5px] text-ink2">
        <span className={cn('size-2 rounded-full', wsMeta.dot)} />
        本地运行 · {wsMeta.label}
      </div>
    </aside>
  )
}
