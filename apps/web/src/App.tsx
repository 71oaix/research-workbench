import { useEffect, useState } from 'react'
import { ArrowRight, Check, Eye, BookOpen, Search, Play } from 'lucide-react'
import { ApprovalPanel } from './components/ApprovalPanel'
import { ArtifactTabs } from './components/ArtifactTabs'
import { EvidencePanel } from './components/EvidencePanel'
import { StepTimeline } from './components/StepTimeline'
import { WorkflowList } from './components/WorkflowList'
import { useWorkflowStore } from './store'
import { cn } from './lib/cn'

const STATUS_LABEL: Record<string, string> = {
  planning: '待启动',
  executing: '运行中',
  paused: '待审批',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
}
const STATUS_PILL: Record<string, string> = {
  planning: 'bg-surface2 text-ink2',
  executing: 'bg-run-soft text-run',
  paused: 'bg-warn-soft text-warn',
  completed: 'bg-ok-soft text-ok',
  cancelled: 'bg-surface2 text-ink2',
  failed: 'bg-bad-soft text-bad',
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

  const awaitingStep = detail?.steps.find((step) => step.status === 'awaiting_approval') ?? null
  const reviewArtifact =
    detail?.artifacts.find((artifact) => artifact.name === '04-review.md') ?? null
  const planArtifact =
    detail?.artifacts
      .filter((artifact) => artifact.name === '01-plan.md')
      .sort((a, b) => b.version - a.version)[0] ?? null
  const canStart = detail !== null && detail.workflow.status === 'planning'

  return (
    <div className="workbench relative grid h-screen grid-cols-[252px_1fr_400px]">
      <WorkflowList wsStatus={wsStatus} />

      <main className="relative min-w-0 overflow-y-auto bg-bg px-10 pb-12 pt-8">
        {error && (
          <div className="mb-4 rounded-(--radius) border border-bad-line bg-bad-soft px-4 py-3 text-[13px] text-bad">
            {error}
          </div>
        )}

        {detail ? (
          <>
            <header>
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
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink2">
                <span>状态：{detail.workflow.status}</span>
                <span>
                  步骤 <strong className="num font-semibold text-ink">{detail.steps.length}</strong> 步
                </span>
                <span>产物 {detail.artifacts.length} 项</span>
                {canStart && (
                  <button
                    onClick={() => void startWorkflow()}
                    className="ml-auto flex items-center gap-1.5 rounded-(--radius) bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
                  >
                    <Play className="size-3.5" strokeWidth={2} />
                    启动工作流
                  </button>
                )}
              </div>
            </header>

            {(detail.workflow.status === 'executing' || detail.workflow.status === 'paused') && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 animate-spin rounded-full border-2 border-accent-line border-t-accent" />
                  检索中
                </span>
                <span>
                  已命中 <strong className="num font-semibold text-ink">{live.hits}</strong>
                </span>
                <span>
                  去重 <strong className="num font-semibold text-ink">{live.unique}</strong>
                </span>
                <span>
                  已下载 <strong className="num font-semibold text-ink">{live.papers}</strong> 篇
                </span>
              </div>
            )}

            <StepTimeline steps={detail.steps} workflowStatus={detail.workflow.status} />

            {awaitingStep &&
              (detail.workflow.status === 'paused' || detail.workflow.status === 'planning') && (
              <ApprovalPanel
                step={awaitingStep}
                decisions={detail.decisions}
                reviewContent={reviewArtifact?.content ?? null}
                planContent={planArtifact?.content ?? null}
                hasWriter={detail.steps.some((step) => step.role === 'writer')}
                onDecide={(type, note) => void decide(awaitingStep.workflowId, awaitingStep.id, type, note)}
              />
            )}
          </>
        ) : (
          <EmptyState onCreate={createWorkflow} />
        )}
      </main>

      <aside className="flex min-w-0 flex-col border-l border-line bg-surface">
        <EvidencePanel artifacts={detail?.artifacts ?? []} />
        <ArtifactTabs artifacts={detail?.artifacts ?? []} />
      </aside>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: (goal: string, includeWriter?: boolean) => Promise<void> }) {
  const [goal, setGoal] = useState('')
  const [writing, setWriting] = useState(true)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!goal.trim()) return
    setBusy(true)
    await onCreate(goal, writing)
    setGoal('')
    setBusy(false)
  }

  return (
    <div className="mx-auto mt-[9vh] max-w-[620px]">
      <div className="mb-5 grid size-12 place-items-center rounded-[14px] bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_2px_6px_rgba(34,31,24,.12)]">
        <Search className="size-5" strokeWidth={1.8} />
      </div>
      <h1 className="text-[23px] font-bold tracking-[-.022em] text-ink">开始一次新的文献调研</h1>
      <p className="mt-2 max-w-[52ch] text-[14px] text-ink2">
        输入研究问题，研镜会自动规划、检索、筛选、写作并核验引用。计划和成品由你审批，中间过程全程可见。
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-(--radius-lg) border border-line-strong bg-surface p-1.5 shadow-(--shadow-lift) focus-within:border-accent-line focus-within:ring-4 focus-within:ring-accent-soft">
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && goal.trim()) void submit()
          }}
          placeholder="例如：研究下多智能体的记忆架构"
          className="flex-1 bg-transparent px-2.5 py-2 text-[15px] text-ink outline-none placeholder:text-ink3"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !goal.trim()}
          className="flex flex-none items-center gap-1.5 rounded-(--radius) bg-accent px-4.5 py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-50"
        >
          开始调研
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink3">试试：</span>
        {['研究下多智能体的记忆架构', 'RAG 在科研写作中的应用', '大模型幻觉的检测与缓解'].map((value) => (
          <button
            key={value}
            onClick={() => setGoal(value)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-ink2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
          >
            {value}
          </button>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-1.5 text-[12px] text-ink2">
        <input
          type="checkbox"
          checked={writing}
          onChange={(event) => setWriting(event.target.checked)}
          className="size-3.5 accent-[#0c665b]"
        />
        包含综述写作（Writer）
      </label>

      <ul className="mt-8 divide-y divide-line-soft">
        {[
          { icon: Eye, title: '可观测', desc: '每个角色的思考、工具调用、上下文与人民币成本实时可见。' },
          { icon: BookOpen, title: '可追踪', desc: '每句论断绑定论文证据，引用经多源交叉核验，可跳原文。' },
          { icon: Check, title: '可控', desc: '计划与成品两个审批点，可打回修改多轮迭代，成本可控。' },
        ].map((feature) => (
          <li key={feature.title} className="flex items-start gap-3 py-3">
            <span className="grid size-7 flex-none place-items-center rounded-[8px] bg-accent-soft text-accent shadow-(--shadow-soft)">
              <feature.icon className="size-3.5" strokeWidth={1.8} />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-ink">{feature.title}</span>
              <span className="mt-0.5 block text-[12px] text-ink2">{feature.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
