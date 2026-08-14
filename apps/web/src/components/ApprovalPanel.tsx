import { useState } from 'react'
import type { Step } from '@research-workbench/shared'

export function ApprovalPanel({
  step,
  onDecide,
}: {
  step: Step
  onDecide: (type: 'approve' | 'reject', note?: string) => void
}) {
  const [note, setNote] = useState('')

  return (
    <section className="approval-panel">
      <h3>审批：{step.label}</h3>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="备注（可选）"
      />
      <div className="approval-actions">
        <button className="approve" onClick={() => onDecide('approve', note || undefined)}>
          通过
        </button>
        <button className="reject" onClick={() => onDecide('reject', note || undefined)}>
          驳回
        </button>
      </div>
    </section>
  )
}
