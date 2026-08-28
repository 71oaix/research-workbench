import { useEffect, useState } from 'react'
import { ArtifactFileTabs } from './components/ArtifactFileTabs'
import { ChatFlow } from './components/ChatFlow'
import { ColumnDivider } from './components/ColumnDivider'
import { ProgressRail } from './components/ProgressRail'
import { WorkflowList } from './components/WorkflowList'
import { IconPanel, IconPlus, IconSpark, IconXCircle } from './components/icons'
import { useWorkflowStore } from './store'
import { cn } from './lib/cn'
import { EXAMPLE_GOALS } from './lib/examples'
import { STATUS_LABEL, STATUS_PILL } from './lib/labels'
import { clampColWidth, DEFAULT_LEFT, DEFAULT_RIGHT, loadLayout, MAX_LEFT, MAX_RIGHT, MIN_LEFT, MIN_RIGHT, saveLayout } from './lib/layout'

export default function App() {
  const detail = useWorkflowStore((state) => state.detail)
  const wsStatus = useWorkflowStore((state) => state.wsStatus)
  const error = useWorkflowStore((state) => state.error)
  const refreshList = useWorkflowStore((state) => state.refreshList)
  const connectWs = useWorkflowStore((state) => state.connectWs)
  const startWorkflow = useWorkflowStore((state) => state.startWorkflow)
  const decide = useWorkflowStore((state) => state.decide)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)
  const live = useWorkflowStore((state) => state.live)
  const streamBuffers = useWorkflowStore((state) => state.streamBuffers)
  const cancelWorkflow = useWorkflowStore((state) => state.cancelWorkflow)

  useEffect(() => {
    void refreshList()
    return connectWs()
  }, [refreshList, connectWs])

  const canStart = detail !== null && detail.workflow.status === 'planning'
  const [railOpen, setRailOpen] = useState(false)
  const [leftW, setLeftW] = useState(() => loadLayout().left)
  const [rightW, setRightW] = useState(() => loadLayout().right)

  useEffect(() => {
    saveLayout({ left: leftW, right: rightW })
  }, [leftW, rightW])

  useEffect(() => {
    setRailOpen(false)
  }, [detail?.workflow.id])

  useEffect(() => {
    if (!railOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [railOpen])

  return (
    <div
      className={cn(
        'workbench relative grid h-screen',
        detail
          ? 'grid-cols-[var(--rw-left,260px)_6px_minmax(0,1fr)] lg:grid-cols-[var(--rw-left,260px)_6px_minmax(0,1fr)_6px_var(--rw-right,260px)]'
          : 'grid-cols-[var(--rw-left,260px)_6px_minmax(0,1fr)]'
      )}
      style={{ '--rw-left': `${leftW}px`, '--rw-right': `${rightW}px` } as React.CSSProperties}
    >
      <WorkflowList wsStatus={wsStatus} />
      <ColumnDivider
        ariaLabel="调整左侧导航宽度"
        onResize={(delta) => setLeftW((width) => clampColWidth(width + delta, MIN_LEFT, MAX_LEFT))}
        onReset={() => setLeftW(DEFAULT_LEFT)}
      />

      <main className="relative flex min-w-0 flex-col overflow-hidden bg-bg">
        <div className="flex-1 overflow-y-auto px-7 pb-12 pt-6">
          {error && (
            <div className="mx-auto mb-4 max-w-[780px] rounded-(--radius) border border-bad-line bg-bad-soft px-4 py-3 text-[14px] text-bad">
              {error}
            </div>
          )}

          {detail ? (
            <>
              <header className="mx-auto mb-4 max-w-[780px]">
                <div className="flex items-start gap-3">
                  <h1 className="font-serif text-[26px] font-semibold tracking-[-.01em] text-ink">{detail.workflow.goal}</h1>
                  <span
                    className={cn(
                      'mt-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
                      STATUS_PILL[detail.workflow.status] ?? 'bg-surface2 text-ink2'
                    )}
                  >
                    {STATUS_LABEL[detail.workflow.status] ?? detail.workflow.status}
                  </span>
                  <button
                    aria-label="打开进度与产出面板"
                    onClick={() => setRailOpen(true)}
                    className="ml-auto mt-0.5 hidden size-8 flex-none place-items-center rounded-(--radius) border border-line-strong bg-surface text-ink2 transition-colors hover:text-ink max-lg:grid"
                  >
                    <IconPanel size={15} />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] text-ink2">
                  <span>
                    <strong className="num font-bold text-ink">{detail.steps.length}</strong> 个步骤
                    <span className="mx-1.5 text-ink3">·</span>
                    <strong className="num font-bold text-ink">{detail.artifacts.length}</strong> 份产物
                  </span>
                  {canStart && (
                    <button
                      onClick={() => void startWorkflow()}
                      className="ml-auto flex items-center gap-1.5 rounded-(--radius) bg-accent px-4 py-1.5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
                    >
                      <IconPlus size={14} />
                      启动工作流
                    </button>
                  )}
                  {detail.workflow.status === 'executing' && (
                    <button
                      onClick={() => void cancelWorkflow()}
                      className="ml-auto flex items-center gap-1.5 rounded-(--radius) border border-bad-line bg-bad-soft px-4 py-1.5 text-[14px] font-semibold text-bad transition-transform duration-150 active:scale-[.96]"
                    >
                      <IconXCircle size={14} />
                      停止
                    </button>
                  )}
                </div>
                {detail.workflow.status === 'executing' && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3 animate-spin rounded-full border-2 border-accent-line border-t-accent" />
                      检索中
                    </span>
                    <span>已命中 <strong className="num font-bold text-ink">{live.hits}</strong></span>
                    <span>去重 <strong className="num font-bold text-ink">{live.unique}</strong></span>
                    <span>已下载 <strong className="num font-bold text-ink">{live.papers}</strong> 篇</span>
                  </div>
                )}
              </header>

              <ChatFlow
                steps={detail.steps}
                artifacts={detail.artifacts}
                decisions={detail.decisions}
                workflowStatus={detail.workflow.status}
                streamBuffers={streamBuffers}
                onDecide={(wf, id, type, note) => void decide(wf, id, type, note)}
              />
            </>
          ) : (
            <EmptyState onCreate={createWorkflow} />
          )}
        </div>

      </main>

      {detail && (
        <>
          <ColumnDivider
            ariaLabel="调整右侧面板宽度"
            className="hidden lg:block"
            onResize={(delta) => setRightW((width) => clampColWidth(width - delta, MIN_RIGHT, MAX_RIGHT))}
            onReset={() => setRightW(DEFAULT_RIGHT)}
          />
          {railOpen && (
            <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setRailOpen(false)} />
          )}
          <aside
            className={cn(
              'fixed inset-y-0 right-0 z-40 flex w-[276px] max-w-[85vw] flex-col border-l border-line bg-surface shadow-(--shadow-lift) transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:shadow-none',
              railOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <ProgressRail steps={detail.steps} workflowStatus={detail.workflow.status} />
            <ArtifactFileTabs artifacts={detail.artifacts} steps={detail.steps} />
          </aside>
        </>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: (goal: string, includeWriter?: boolean) => Promise<void> }) {
  const [goal, setGoal] = useState('')
  const [writing, setWriting] = useState(true)
  async function submit() {
    if (!goal.trim()) return
    await onCreate(goal, writing)
    setGoal('')
  }
  return (
    <div className="mx-auto mt-[16vh] max-w-[620px]">
      <div className="mb-5 grid size-12 place-items-center rounded-[16px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_2px_6px_rgba(34,31,24,.12)]">
        <IconSpark size={22} />
      </div>
      <h1 className="font-serif text-[26px] font-semibold tracking-[-.01em] text-ink">开始一次新的文献调研</h1>
      <p className="mt-2 max-w-[52ch] text-[15px] text-ink2">输入研究问题，研镜会自动规划、检索、筛选、写作并核验引用。</p>
      <div className="mt-6 flex items-center gap-2 rounded-(--radius-lg) border border-line-strong bg-surface p-1.5 shadow-(--shadow-lift) focus-within:border-accent-line focus-within:ring-4 focus-within:ring-accent-soft">
        <input value={goal} onChange={(event) => setGoal(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && goal.trim()) void submit() }} placeholder="例如：研究下多智能体的记忆架构" className="flex-1 bg-transparent px-2.5 py-2 text-[16px] text-ink outline-none placeholder:text-ink3" />
        <button onClick={() => void submit()} disabled={!goal.trim()} className="flex flex-none items-center gap-1.5 rounded-(--radius) bg-accent px-4.5 py-2.5 text-[14px] font-semibold text-white transition-transform duration-150 active:scale-[.96] disabled:opacity-50">
          开始调研 <IconSpark size={14} />
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink2">
        <input type="checkbox" checked={writing} onChange={(event) => setWriting(event.target.checked)} className="size-3.5 accent-[#0c665b]" />
        包含综述写作（Writer）
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-ink3">试试：</span>
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
    </div>
  )
}
