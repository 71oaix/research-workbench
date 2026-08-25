import { useState } from 'react'
import { BookMarked, Plus, Sparkles, X } from 'lucide-react'
import { useWorkflowStore } from '../store'
import { cn } from '../lib/cn'

const STATUS_DOT: Record<string, string> = {
  planning: 'bg-accent',
  executing: 'bg-run',
  paused: 'bg-warn',
  completed: 'bg-ok',
  cancelled: 'bg-ink3',
  failed: 'bg-bad',
}

export function WorkflowList({ wsStatus }: { wsStatus: string }) {
  const workflows = useWorkflowStore((state) => state.workflows)
  const selectedId = useWorkflowStore((state) => state.selectedId)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)
  const selectWorkflow = useWorkflowStore((state) => state.selectWorkflow)
  const [goal, setGoal] = useState('')
  const [writing, setWriting] = useState(true)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleCreate() {
    setCreating(true)
    await createWorkflow(goal, writing)
    setGoal('')
    setOpen(false)
    setCreating(false)
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-line bg-sidebar px-3 pb-3 pt-4">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
          <BookMarked className="h-4 w-4" strokeWidth={1.9} />
        </div>
        <div className="leading-none">
          <div className="text-[16px] font-bold tracking-[.01em]">研镜</div>
          <div className="mt-1 font-serif text-[11px] italic tracking-[.02em] text-ink3">
            Research Workbench
          </div>
        </div>
      </div>

      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-center gap-1.5 rounded-(--radius) bg-accent py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.2} />
        新建调研
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[560px] rounded-(--radius-lg) border border-line-soft bg-surface p-5 shadow-(--shadow-lift) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[15px] font-bold tracking-[-.01em]">新的调研任务</div>
              <button
                aria-label="关闭"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-ink3 hover:bg-surface2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[12.5px] text-ink2">输入研究问题，研镜会自动规划、检索、筛选、写作并核验引用。</p>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && goal.trim()) void handleCreate()
              }}
              placeholder="例如：研究下多智能体的记忆架构"
              className="w-full rounded-(--radius) border border-line-strong bg-bg px-3 py-2.5 text-[14px] outline-none placeholder:text-ink3 focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
              autoFocus
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {['研究下多智能体的记忆架构', '大模型幻觉的检测与缓解'].map((value) => (
                <button
                  key={value}
                  onClick={() => setGoal(value)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-ink2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-ink2">
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
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-(--radius) bg-accent py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              创建并开始
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
        <div className="mb-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[.11em] text-ink3">
          最近工作流
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {workflows.map((workflow) => {
            const active = workflow.id === selectedId
            return (
              <li key={workflow.id}>
                <button
                  onClick={() => void selectWorkflow(workflow.id)}
                  className={cn(
                    'flex w-full gap-2 rounded-(--radius) px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-white shadow-(--shadow-soft)' : 'hover:bg-white/60'
                  )}
                >
                  <span
                    className={cn(
                      'mt-[7px] size-1.5 flex-none rounded-full shadow-[0_0_0_3px_rgba(255,255,255,.6)]',
                      STATUS_DOT[workflow.status]
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium leading-[1.4] text-ink">
                      {workflow.goal}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink3">
                      {workflow.createdAt.slice(0, 10)} · {workflow.id.slice(0, 8)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {workflows.length === 0 && (
            <li className="px-2 py-3 text-[12px] text-ink3">暂无工作流，先新建一个。</li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line-soft px-2 pt-3 text-[12px] text-ink2">
        <span className="size-2 rounded-full bg-ok shadow-[0_0_0_3px_var(--color-ok-soft)]" />
        本地运行 · WS {wsStatus}
      </div>
    </aside>
  )
}
