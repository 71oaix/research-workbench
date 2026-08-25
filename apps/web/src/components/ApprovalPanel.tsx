import { useState } from 'react'
import type { Decision, Step } from '@research-workbench/shared'
import { parseConcernLedger } from '@research-workbench/shared'
import { Check, RotateCcw, XCircle, AlertTriangle } from 'lucide-react'

export function ApprovalPanel({
  step,
  decisions,
  onDecide,
  reviewContent,
  planContent,
  hasWriter,
}: {
  step: Step
  decisions: Decision[]
  onDecide: (type: 'approve' | 'modify' | 'reject', note?: string) => void
  reviewContent?: string | null
  planContent?: string | null
  hasWriter?: boolean
}) {
  const [note, setNote] = useState('')
  const isReviewer = step.role === 'reviewer'
  const clarification = planContent?.includes('## 澄清请求')
    ? extractClarificationQuestions(planContent)
    : []
  const needsClarification = clarification.length > 0
  const blockingConcerns = reviewContent
    ? parseConcernLedger(reviewContent).filter((concern) => concern.blocking)
    : []
  const canModify = note.trim().length > 0 || (isReviewer && blockingConcerns.length > 0)

  function handleModify() {
    if (isReviewer && blockingConcerns.length > 0 && !note.trim()) {
      const autoNote = blockingConcerns.map((concern) => `${concern.id} [blocking] ${concern.claim}`).join('\n')
      onDecide('modify', autoNote)
      return
    }
    onDecide('modify', note.trim() || undefined)
  }

  function handleCancel() {
    if (window.confirm('确定取消整个任务吗？')) {
      onDecide('reject', note.trim() || undefined)
    }
  }

  return (
    <section className="mt-7 max-w-[760px] rounded-(--radius-lg) border border-line-soft border-t-2 border-t-warn-line bg-surface p-5 shadow-(--shadow-lift) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-[9px] bg-warn-soft text-warn">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[15px] font-bold tracking-[-.01em]">审批：{step.label}</div>
          <div className="mt-0.5 text-[12px] text-ink2">打回后将从当前步骤重新生成</div>
        </div>
      </div>

      {clarification.length > 0 && (
        <div className="mt-3 rounded-(--radius) border border-warn-line bg-warn-soft px-3.5 py-3">
          <p className="text-[13px] font-semibold text-warn">该计划需要澄清，请在意见中回答：</p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[12.5px] text-ink2">
            {clarification.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ol>
        </div>
      )}

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="修改意见 / 备注（打回修改时必须填写）"
        className="mt-4 min-h-[60px] w-full resize-y rounded-(--radius) border border-line bg-surface px-3 py-2.5 text-[13px] outline-none placeholder:text-ink3 focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
      />

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {!needsClarification && (
          <button
            onClick={() => onDecide('approve')}
            className="flex items-center gap-1.5 rounded-(--radius) bg-accent px-4.5 py-2 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.15)] transition-transform duration-150 active:scale-[.96]"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
            通过
          </button>
        )}
        <button
          onClick={handleModify}
          disabled={!canModify}
          className="flex items-center gap-1.5 rounded-(--radius) border border-bad-line bg-bad-soft px-4.5 py-2 text-[13px] font-semibold text-bad transition-transform duration-150 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
          {needsClarification
            ? '提交回答并重新规划'
            : isReviewer && blockingConcerns.length > 0
              ? hasWriter
                ? '打回 Writer'
                : '打回重跑'
              : '打回修改'}
        </button>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1.5 rounded-(--radius) border border-line-strong bg-surface px-4.5 py-2 text-[13px] font-semibold text-ink2 transition-transform duration-150 active:scale-[.96]"
        >
          <XCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
          取消任务
        </button>
      </div>

      {decisions.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <div className="text-[11px] font-bold uppercase tracking-[.11em] text-ink3">决策历史</div>
          <ul className="mt-2 space-y-1.5">
            {decisions.map((decision) => (
              <li key={decision.id} className="flex items-start gap-2 text-[12.5px]">
                <span className="mt-0.5 flex-none rounded-full bg-surface2 px-2 py-px text-[11px] font-semibold text-ink2">
                  {decision.type}
                </span>
                <span className="min-w-0 text-ink2">{decision.note ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function extractClarificationQuestions(planContent: string): string[] {
  const match = planContent.match(/##\s*澄清请求\s*([\s\S]*?)(?=\n##\s|\n#\s|$)/)
  if (!match) return []
  const questions: string[] = []
  for (const line of match[1].split('\n')) {
    const item = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)、]\s*/, '')
      .trim()
    if (item && !item.startsWith('#') && item.length >= 2) questions.push(item)
  }
  return questions.slice(0, 6)
}
