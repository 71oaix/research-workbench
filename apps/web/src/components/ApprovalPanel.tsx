import { useState } from 'react'
import type { Decision, Step } from '@research-workbench/shared'

export function ApprovalPanel({
  step,
  decisions,
  onDecide,
}: {
  step: Step
  decisions: Decision[]
  onDecide: (type: 'approve' | 'modify' | 'reject', note?: string) => void
}) {
  const [note, setNote] = useState('')

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
          onClick={() => onDecide('modify', note.trim() || undefined)}
          disabled={note.trim().length === 0}
        >
          打回修改
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
