import { useState } from 'react'
import type { Decision, Step } from '@research-workbench/shared'
import { parseConcernLedger } from '@research-workbench/shared'

export function ApprovalPanel({
  step,
  decisions,
  onDecide,
  reviewContent,
}: {
  step: Step
  decisions: Decision[]
  onDecide: (type: 'approve' | 'modify' | 'reject', note?: string) => void
  reviewContent?: string | null
}) {
  const [note, setNote] = useState('')
  const isReviewer = step.role === 'reviewer'
  const blockingConcerns = reviewContent
    ? parseConcernLedger(reviewContent).filter((concern) => concern.blocking)
    : []

  function handleModify() {
    const trimmed = note.trim()
    if (isReviewer && blockingConcerns.length > 0 && !trimmed) {
      const autoNote = blockingConcerns
        .map((concern) => `${concern.id} [blocking] ${concern.claim}`)
        .join('\n')
      onDecide('modify', autoNote)
      return
    }
    onDecide('modify', trimmed || undefined)
  }

  function handleCancel() {
    if (window.confirm('确定取消整个任务吗？')) {
      onDecide('reject', note.trim() || undefined)
    }
  }

  return (
    <section className="approval-panel">
      <h3>审批：{step.label}</h3>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="修改意见 / 备注（打回修改时必须填写）"
      />
      <div className="approval-actions">
        <button className="approve" onClick={() => onDecide('approve')}>
          通过
        </button>
        <button
          className="modify"
          onClick={handleModify}
          disabled={!note.trim() && !(isReviewer && blockingConcerns.length > 0)}
        >
          {isReviewer && blockingConcerns.length > 0 ? '打回 Writer' : '打回修改'}
        </button>
        <button className="cancel" onClick={handleCancel}>
          取消任务
        </button>
      </div>
      {decisions.length > 0 && (
        <div className="decision-history">
          <h4>决策历史</h4>
          <ul>
            {decisions.map((decision) => (
              <li key={decision.id}>
                <span className={`decision-type decision-${decision.type}`}>
                  {decision.type}
                </span>
                <span>{decision.note ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
