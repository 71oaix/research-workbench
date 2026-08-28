import { useEffect, useMemo, useRef, useState } from 'react'
import type { Artifact, Decision, Step } from '@research-workbench/shared'
import { cn } from '../lib/cn'
import { parseVerificationTable, type CiteMeta } from '../lib/citations'
import { ApprovalPanel } from './ApprovalPanel'
import { Collapsible } from './Collapsible'
import { MarkdownView } from './MarkdownView'
import { PaperCards, parseCards } from './PaperCards'
import { StructureDiff } from './StructureDiff'
import { IconCheck, IconFilter, IconPen, IconPlan, IconScale, IconSearch, IconShield, IconSpin, IconUser } from './icons'

/** stepId → 展开回调：跳转（进度/引用/文件 tab）前先展开折叠的产物卡 */
const expandRegistry = new Map<string, () => void>()

export function expandStep(stepId: string): void {
  expandRegistry.get(stepId)?.()
}

function shouldCollapse(artifactName: string, content: string): boolean {
  if (!content) return false
  if (content.length > 800) return true
  if (artifactName === 'research-cards.md' && parseCards(content).length > 10) return true
  return false
}

function artifactLabel(name: string): string {
  return (
    {
      '01-plan.md': '检索计划',
      'research-candidates.md': '候选论文',
      'research-cards.md': '证据卡片',
      '03-draft.md': '综述初稿',
      'evaluation-report.md': '评估报告',
      '04-review.md': '审查意见',
      '05-summary.md': '调研摘要',
    }[name] ?? name
  )
}

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
  steps, artifacts, decisions, workflowStatus, streamBuffers, onDecide,
}: {
  steps: Step[]
  artifacts: Artifact[]
  decisions: Decision[]
  workflowStatus: string
  streamBuffers?: Record<string, { text: string; thinking: string }>
  onDecide: (workflowId: string, stepId: string, type: 'approve' | 'modify' | 'reject', note?: string) => void
}) {
  return (
    <div className="mx-auto max-w-[780px] space-y-3.5">
      {steps.filter((step) => step.status !== 'pending').map((step) => (
        <StepBubble
          key={step.id}
          step={step}
          artifacts={artifacts}
          decisions={decisions}
          workflowStatus={workflowStatus}
          hasWriter={steps.some((candidate) => candidate.role === 'writer')}
          selectorStepId={steps.find((candidate) => candidate.role === 'selector')?.id ?? null}
          streamText={streamBuffers?.[step.id]?.text}
          streamThinking={streamBuffers?.[step.id]?.thinking}
          onDecide={onDecide}
        />
      ))}
    </div>
  )
}

function StepBubble({
  step, artifacts, decisions, workflowStatus, hasWriter, selectorStepId, streamText, streamThinking, onDecide,
}: {
  step: Step
  artifacts: Artifact[]
  decisions: Decision[]
  workflowStatus: string
  hasWriter: boolean
  selectorStepId: string | null
  streamText?: string
  streamThinking?: string
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
  const [showDiff, setShowDiff] = useState(false)
  const active = group.find((item) => item.version === activeVersion) ?? latest ?? null
  const coverageMd =
    artifacts.filter((artifact) => artifact.name === 'coverage-matrix.md').at(-1)?.content ?? null

  const reviewContent = artifacts
    .filter((artifact) => artifact.name === '04-review.md')
    .sort((a, b) => b.version - a.version)[0]?.content ?? null
  const planContent = artifacts
    .filter((artifact) => artifact.name === '01-plan.md')
    .sort((a, b) => b.version - a.version)[0]?.content ?? null

  const isDraft = artifactName === '03-draft.md'
  const citations = useMemo(() => {
    if (!isDraft) return undefined
    const cardsArtifact = artifacts.filter((artifact) => artifact.name === 'research-cards.md').at(-1)
    const verification = artifacts.filter((artifact) => artifact.name === 'citation-verification.md').at(-1)
    const cards = cardsArtifact ? parseCards(cardsArtifact.content) : []
    const meta = parseVerificationTable(verification?.content ?? null)
    for (const [id, item] of meta) {
      const card = cards.find((candidate) => candidate.id === id)
      if (card) {
        item.title = card.title
        item.year = card.year
      }
    }
    return meta
  }, [isDraft, artifacts])

  function handleCiteClick(id: number) {
    if (!citations?.get(id) || citations.get(id)!.status === 'unknown') return
    if (!selectorStepId) return
    expandStep(selectorStepId)
    const root = document.getElementById(`step-${selectorStepId}`)
    const card = root?.querySelector(`[data-card-id="${id}"]`)
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.classList.add('cite-flash')
    setTimeout(() => card.classList.remove('cite-flash'), 1700)
  }

  const activeIndex = group.findIndex((item) => item.version === activeVersion)
  const diffBase = activeIndex > 0 ? group[activeIndex - 1] : null

  // 折叠：长产物默认折叠（综述/候选池/多卡），其余展开
  const [collapsed, setCollapsed] = useState(() => shouldCollapse(artifactName, latest?.content ?? ''))
  // 展开注册表：跳转（进度/引用/文件 tab）前先展开
  useEffect(() => {
    expandRegistry.set(step.id, () => setCollapsed(false))
    return () => {
      expandRegistry.delete(step.id)
    }
  }, [step.id])
  useEffect(() => {
    if (step.status === 'running' && (streamText || streamThinking)) setCollapsed(false)
  }, [step.status, streamText, streamThinking])

  const cardCount = artifactName === 'research-cards.md' && latest ? parseCards(latest.content).length : 0
  const summary =
    cardCount > 0
      ? `${cardCount} 张卡片`
      : latest
        ? `约 ${Math.max(1, Math.round(latest.content.length / 1000))}k 字`
        : null
  const header = (
    <>
      <span className="text-[13px] font-semibold text-ink">{ROLE_LABELS[step.role]} · {artifactLabel(artifactName)}</span>
      {group.length > 1 && <span className="text-[11.5px] text-ink3">{group.length} 个版本</span>}
    </>
  )

  return (
    <div id={`step-${step.id}`} className="scroll-mt-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span
          className={cn(
            'grid size-7 flex-none place-items-center rounded-[11px] border',
            isCurrent && 'border-accent bg-accent text-white ring-4 ring-accent-soft',
            isDone && 'border-ok-line bg-ok-soft text-ok',
            !isCurrent && !isDone && 'border-line-strong bg-surface text-ink3'
          )}
        >
          {isDone ? <IconCheck size={14} /> : step.status === 'running' ? <IconSpin className="animate-spin text-accent" /> : <Icon size={14} />}
        </span>
        <span className="text-[15px] font-semibold tracking-[-.005em]">{ROLE_LABELS[step.role]}</span>
        {step.status === 'running' ? (
          <CyclingLabel role={step.role} />
        ) : (
          <span className={cn('text-[12px] font-semibold', status.cls)}>{status.label}</span>
        )}
        <span className="ml-auto text-[12px] text-ink3">{step.label}</span>
      </div>

      {step.status === 'running' && (streamText || streamThinking) && (
        <StreamPreview text={streamText} thinking={streamThinking} />
      )}

      {group.length > 0 && (
        <div className="rounded-(--radius-lg) border border-line-soft bg-surface shadow-(--shadow-soft) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]">
          {group.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-line-soft px-3 pt-1.5">
              {group.map((item) => (
                <button
                  key={item.version}
                  onClick={() => {
                    setActiveVersion(item.version)
                    setShowDiff(false)
                  }}
                  className={cn(
                    'border-b-2 px-2.5 py-1.5 text-[12px] transition-colors',
                    item.version === activeVersion
                      ? 'border-accent font-semibold text-accent'
                      : 'border-transparent text-ink2 hover:text-ink'
                  )}
                >
                  v{item.version}
                </button>
              ))}
              <button
                onClick={() => setShowDiff((value) => !value)}
                disabled={activeIndex < 1}
                className={cn(
                  'ml-auto flex-none rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  showDiff
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line-strong bg-surface text-ink2 hover:bg-surface2'
                )}
              >
                结构对比
              </button>
            </div>
          )}
          <Collapsible
            open={!collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            header={header}
            summary={summary}
            flush={group.length > 1}
            bodyClassName="p-4 pt-3"
          >
            {showDiff && diffBase && active && (
              <div className="mb-3 rounded-(--radius) border border-line-soft bg-surface2/50 p-3">
                <StructureDiff prev={diffBase.content} next={active.content} />
              </div>
            )}
            {renderContent(artifactName, active?.content ?? '', citations, handleCiteClick)}
            {artifactName === 'research-cards.md' && coverageMd && (
              <div className="mt-4 border-t border-line-soft pt-3">
                <MarkdownView content={coverageMd} />
              </div>
            )}
          </Collapsible>
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

function renderContent(
  name: string,
  content: string,
  citations?: Map<number, CiteMeta>,
  onCiteClick?: (id: number) => void
) {
  if (name === 'research-cards.md') return <PaperCards content={content} />
  if (name === '03-draft.md') return <MarkdownView content={content} doc citations={citations} onCiteClick={onCiteClick} />
  if (name.endsWith('.md')) return <MarkdownView content={content} />
  return <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] text-ink">{content}</pre>
}

/** 流式预览：思考块（浅色斜体，自动滚底）+ 正文流式（尾部光标）。thinking 停止后标签切为"已思考 N 秒"。 */
function StreamPreview({ text, thinking }: { text?: string; thinking?: string }) {
  const thinkingRef = useRef<HTMLDivElement>(null)
  const [startedAt] = useState(() => Date.now())
  const [, tick] = useState(0)
  const thinkingDone = Boolean(text)

  useEffect(() => {
    const el = thinkingRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thinking])

  useEffect(() => {
    if (thinkingDone) return
    const timer = setInterval(() => tick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [thinkingDone])

  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))

  return (
    <div className="rounded-(--radius-lg) border border-line-soft bg-surface shadow-(--shadow-soft)">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.11em] text-ink3">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        实时输出
      </div>
      <div className="p-4">
        {thinking && (
          <div ref={thinkingRef} className="stream-thinking">
            <span className="stream-thinking-label">
              {thinkingDone ? `已思考 ${seconds} 秒` : `思考中 · ${seconds}s`}
            </span>
            {thinking}
          </div>
        )}
        {text && (
          <div className="md-body streaming">
            <MarkdownView content={text} />
            <span className="stream-cursor" />
          </div>
        )}
      </div>
    </div>
  )
}
