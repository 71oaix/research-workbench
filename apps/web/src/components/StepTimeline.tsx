import type { Step } from '@research-workbench/shared'

const ROLE_LABELS: Record<Step['role'], string> = {
  planner: '规划',
  researcher: '检索',
  writer: '写作',
  evaluator: '评估',
  reviewer: '审查',
}

export function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="step-timeline">
      {steps.map((step, index) => (
        <li key={step.id} className={`step step-${step.status}`}>
          <span className="step-index">{index + 1}</span>
          <span className="step-label">{ROLE_LABELS[step.role]}</span>
          <span className="step-status">{step.status}</span>
        </li>
      ))}
    </ol>
  )
}
