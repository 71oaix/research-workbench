import { useEffect, useState } from 'react'
import { ArtifactFileTabs } from './components/ArtifactFileTabs'
import { ChatFlow } from './components/ChatFlow'
import { ProgressRail } from './components/ProgressRail'
import { WorkflowList } from './components/WorkflowList'
import { IconPlus, IconSpark } from './components/icons'
import { useWorkflowStore } from './store'
import { cn } from './lib/cn'

const STATUS_LABEL: Record<string, string> = {
  planning: '待启动', executing: '运行中', paused: '待审批',
  completed: '已完成', cancelled: '已取消', failed: '失败',
}
const STATUS_PILL: Record<string, string> = {
  planning: 'bg-surface2 text-ink2', executing: 'bg-run-soft text-run', paused: 'bg-warn-soft text-warn',
  completed: 'bg-ok-soft text-ok', cancelled: 'bg-surface2 text-ink2', failed: 'bg-bad-soft text-bad',
}

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

  useEffect(() => {
    void refreshList()
    return connectWs()
  }, [refreshList, connectWs])

  const canStart = detail !== null && detail.workflow.status === 'planning'

  return (
    <div className="workbench relative grid h-screen grid-cols-[216px_1fr_276px]">
      <WorkflowList wsStatus={wsStatus} />

      <main className="relative flex min-w-0 flex-col overflow-hidden bg-bg">
        <div className="flex-1 overflow-y-auto px-7 pb-12 pt-6">
          {error && (
            <div className="mx-auto mb-4 max-w-[720px] rounded-(--radius) border border-bad-line bg-bad-soft px-4 py-3 text-[13px] text-bad">
              {error}
            </div>
          )}

          {detail ? (
            <>
              <header className="mx-auto mb-4 max-w-[720px]">
                <div className="flex items-start gap-3">
                  <h1 className="text-[22px] font-bold tracking-[-.02em] text-ink">{detail.workflow.goal}</h1>
                  <span
                    className={cn(
                      'mt-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
                      STATUS_PILL[detail.workflow.status] ?? 'bg-surface2 text-ink2'
                    )}
                  >
                    {STATUS_LABEL[detail.workflow.status] ?? detail.workflow.status}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink2">
                  <span>状态：{detail.workflow.status}</span>
                  <span>步骤 <strong className="num font-semibold text-ink">{detail.steps.length}</strong> 步</span>
                  <span>产物 {detail.artifacts.length} 项</span>
                  {canStart && (
                    <button
                      onClick={() => void startWorkflow()}
                      className="ml-auto flex items-center gap-1.5 rounded-(--radius) bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
                    >
                      <IconPlus size={14} />
                      启动工作流
                    </button>
                  )}
                </div>
                {(detail.workflow.status === 'executing' || detail.workflow.status === 'paused') && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3 animate-spin rounded-full border-2 border-accent-line border-t-accent" />
                      检索中
                    </span>
                    <span>已命中 <strong className="num font-semibold text-ink">{live.hits}</strong></span>
                    <span>去重 <strong className="num font-semibold text-ink">{live.unique}</strong></span>
                    <span>已下载 <strong className="num font-semibold text-ink">{live.papers}</strong> 篇</span>
                  </div>
                )}
              </header>

              <ChatFlow
                steps={detail.steps}
                artifacts={detail.artifacts}
                decisions={detail.decisions}
                workflowStatus={detail.workflow.status}
                onDecide={(wf, id, type, note) => void decide(wf, id, type, note)}
              />
            </>
          ) : (
            <EmptyState onCreate={createWorkflow} />
          )}
        </div>

      </main>

      <aside className="flex min-w-0 flex-col border-l border-line bg-surface">
        <ProgressRail steps={detail?.steps ?? []} workflowStatus={detail?.workflow.status ?? 'planning'} />
        <ArtifactFileTabs artifacts={detail?.artifacts ?? []} steps={detail?.steps ?? []} />
      </aside>
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
      <div className="mb-5 grid size-12 place-items-center rounded-[14px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_2px_6px_rgba(34,31,24,.12)]">
        <IconSpark size={22} />
      </div>
      <h1 className="text-[23px] font-bold tracking-[-.022em] text-ink">开始一次新的文献调研</h1>
      <p className="mt-2 max-w-[52ch] text-[14px] text-ink2">输入研究问题，研镜会自动规划、检索、筛选、写作并核验引用。</p>
      <div className="mt-6 flex items-center gap-2 rounded-(--radius-lg) border border-line-strong bg-surface p-1.5 shadow-(--shadow-lift) focus-within:border-accent-line focus-within:ring-4 focus-within:ring-accent-soft">
        <input value={goal} onChange={(event) => setGoal(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && goal.trim()) void submit() }} placeholder="例如：研究下多智能体的记忆架构" className="flex-1 bg-transparent px-2.5 py-2 text-[15px] text-ink outline-none placeholder:text-ink3" />
        <button onClick={() => void submit()} disabled={!goal.trim()} className="flex flex-none items-center gap-1.5 rounded-(--radius) bg-accent px-4.5 py-2.5 text-[13px] font-semibold text-white transition-transform duration-150 active:scale-[.96] disabled:opacity-50">
          开始调研 <IconSpark size={14} />
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-ink2">
        <input type="checkbox" checked={writing} onChange={(event) => setWriting(event.target.checked)} className="size-3.5 accent-[#0c665b]" />
        包含综述写作（Writer）
      </label>
    </div>
  )
}
