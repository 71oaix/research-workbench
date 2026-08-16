import { useState } from 'react'
import { useWorkflowStore } from '../store'

export function WorkflowList() {
  const workflows = useWorkflowStore((state) => state.workflows)
  const selectedId = useWorkflowStore((state) => state.selectedId)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)
  const selectWorkflow = useWorkflowStore((state) => state.selectWorkflow)
  const [goal, setGoal] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    setCreating(true)
    await createWorkflow(goal)
    setGoal('')
    setCreating(false)
  }

  return (
    <aside className="pane-left">
      <h2>工作流</h2>
      <div className="new-workflow">
        <input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="研究问题"
        />
        <button
          onClick={() => void handleCreate()}
          disabled={creating || goal.trim().length === 0}
        >
          新建
        </button>
      </div>
      <ul className="workflow-list">
        {workflows.map((workflow) => (
          <li key={workflow.id}>
            <button
              className={workflow.id === selectedId ? 'active' : ''}
              onClick={() => void selectWorkflow(workflow.id)}
            >
              <span className="workflow-goal">{workflow.goal}</span>
              <span className={`badge badge-${workflow.status}`}>{workflow.status}</span>
              <span className="workflow-meta">
                {workflow.createdAt.slice(0, 10)} · {workflow.id.slice(0, 8)}
              </span>
            </button>
          </li>
        ))}
        {workflows.length === 0 && <li className="placeholder">暂无工作流</li>}
      </ul>
    </aside>
  )
}
