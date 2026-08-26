import { useEffect, useState } from 'react'
import type { Artifact, Decision, Step } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { ApprovalPanel } from './ApprovalPanel'
import { MarkdownView } from './MarkdownView'
import { PaperCards } from './PaperCards'
import { IconCheck, IconFilter, IconPen, IconPlan, IconScale, IconSearch, IconShield, IconSpin, IconUser } from './icons'

const ROLE_LABELS: Record<Step['role'], string> = {
  planner: '规划', researcher: '检索', selector: '筛选', writer: '写作',
  evaluator: '评估', reviewer: '审查', summarizer: '归纳',
}
const ROLE_ICONS: Record<Step['role'], (s: { size?: number }) => ReturnType<typeof IconPlan>> = {
  planner: IconPlan, researcher: IconSearch, selector: IconFilter, writer: IconPen,
  evaluator: IconScale, reviewer: IconShield, summarizer: IconPlan,
}
const ROLE_ARTIFACT: Record<Step['role'], string> = {
  planner: '01-plan.md', researcher: 'research-candidates.md', selector: 'research-cards.md',
  writer: '03-draft.md', evaluator: 'evaluation-report.md', reviewer: '04-review.md', summarizer: '05-summary.md',
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
  const [faded, setFaded] = useState(false)
  useEffect(() => {
    if (phrases.length < 2) return
    const timer = setInterval(() => {
      setFaded(true)
      setTimeout(() => {
        setI((index) => (index + 1) % phrases.length)
        setFaded(false)
      }, 260)
    }, 3000)
    return () => clearInterval(timer)
  }, [phrases.length])
  return (
    <span className={cn('transition-opacity duration-300 ease-out text-run', faded && 'opacity-0')}>
      {phrases[i]}
    </span>
  )
}

function statusMeta(step: Step, workflowStatus: string): { label: string; cls: string } {
  const awaitingActive = workflowStatus === 'paused' || workflowStatus === 'planning'
  if (step.status === 'awaiting_approval') {
    return awaitingActive ? { label: '待你审批', cls: 'text-warn' } : { label: '已通过', cls: 'text-ok' }
  }
  switch (step.status) {
    case 'running': return { label: '进行中', cls: 'text-run' }
    case 'approved': return { label: '已通过', cls: 'text-ok' }
    case 'rejected': case 'failed': return { label: step.status === 'failed' ? '失败' : '已打回', cls: 'text-bad' }
    case 'skipped': return { label: '跳过', cls: 'text-ink3' }
    default: return { label: '排队', cls: 'text-ink3' }
  }
}

export function ChatFlow({
  steps, artifacts, decisions, workflowStatus, onDecide,
}: {
  steps: Step[]
  artifacts: Artifact[]
  decisions: Decision[]
  workflowStatus: string
  onDecide: (workflowId: string, stepId: string, type: 'approve' | 'modify' | 'reject', note?: string) => void
}) {
  return (
    <div className="mx-auto max-w-[720px] space-y-3.5">
      {steps.filter((step) => step.status !== 'pending').map((step) => (
        <StepBubble
          key={step.id}
          step={step}
          artifacts={artifacts}
          decisions={decisions}
          workflowStatus={workflowStatus}
          hasWriter={steps.some((candidate) => candidate.role === 'writer')}
          onDecide={onDecide}
        />
      ))}
    </div>
  )
}

function StepBubble({
  step, artifacts, decisions, workflowStatus, hasWriter, onDecide,
}: {
  step: Step
  artifacts: Artifact[]
  decisions: Decision[]
  workflowStatus: string
  hasWriter: boolean
  onDecide: (workflowId: string, stepId: string, type: 'approve' | 'modify' | 'reject', note?: string) => void
}) {
  const Icon = ROLE_ICONS[step.role]
  const status = statusMeta(step, workflowStatus)
  const isCurrent = status.label === '进行中' || status.label === '待你审批'
  const isDone = status.label === '已通过'
  const artifactName = ROLE_ARTIFACT[step.role]
  const group = artifacts
    .filter((artifact) => artifact.name === artifactName)
    .sort((a, b) => a.version - b.version)
  const latest = group.at(-1) ?? null
  const [activeVersion, setActiveVersion] = useState<number | null>(latest?.version ?? null)
  const active = group.find((item) => item.version === activeVersion) ?? latest ?? null

  const reviewContent = artifacts
    .filter((artifact) => artifact.name === '04-review.md')
    .sort((a, b) => b.version - a.version)[0]?.content ?? null
  const planContent = artifacts
    .filter((artifact) => artifact.name === '01-plan.md')
    .sort((a, b) => b.version - a.version)[0]?.content ?? null

  return (
    <div id={`step-${step.id}`} className="scroll-mt-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span
          className={cn(
            'grid size-7 flex-none place-items-center rounded-[9px] border',
            isCurrent && 'border-accent bg-accent text-white ring-4 ring-accent-soft',
            isDone && 'border-ok-line bg-ok-soft text-ok',
            !isCurrent && !isDone && 'border-line-strong bg-surface text-ink3'
          )}
        >
          {isDone ? <IconCheck size={14} /> : step.status === 'running' ? <IconSpin className="animate-spin text-accent" /> : <Icon size={14} />}
        </span>
        <span className="text-[14px] font-semibold tracking-[-.005em]">{ROLE_LABELS[step.role]}</span>
        {step.status === 'running' ? (
          <CyclingLabel role={step.role} />
        ) : (
          <span className={cn('text-[11px] font-semibold', status.cls)}>{status.label}</span>
        )}
        <span className="ml-auto text-[11px] text-ink3">{step.label}</span>
      </div>

      {group.length > 0 && (
        <div className="overflow-hidden rounded-(--radius-lg) border border-line-soft bg-surface shadow-(--shadow-soft) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]">
          {group.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-line-soft px-3 pt-1.5">
              {group.map((item) => (
                <button
                  key={item.version}
                  onClick={() => setActiveVersion(item.version)}
                  className={cn(
                    'border-b-2 px-2.5 py-1.5 text-[12px] transition-colors',
                    item.version === activeVersion
                      ? 'border-accent font-semibold text-accent'
                      : 'border-transparent text-ink2 hover:text-ink'
                  )}
                >
                  版本 v{item.version}
                </button>
              ))}
            </div>
          )}
          <div className="p-4">
            {renderContent(artifactName, active?.content ?? '')}
          </div>
        </div>
      )}

      {(step.status === 'awaiting_approval' && (workflowStatus === 'paused' || workflowStatus === 'planning')) && (
        <ApprovalPanel
          step={step}
          decisions={decisions}
          reviewContent={reviewContent}
          planContent={planContent}
          hasWriter={hasWriter}
          onDecide={(type, note) => onDecide(step.workflowId, step.id, type, note)}
        />
      )}
    </div>
  )
}

function renderContent(name: string, content: string) {
  if (name === 'research-cards.md') return <PaperCards content={content} />
  if (name.endsWith('.md')) return <MarkdownView content={content} />
  return <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] text-ink">{content}</pre>
}
