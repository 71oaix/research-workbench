import { useEffect } from 'react'
import { ApprovalPanel } from './components/ApprovalPanel'
import { ArtifactTabs } from './components/ArtifactTabs'
import { EvidencePanel } from './components/EvidencePanel'
import { StepTimeline } from './components/StepTimeline'
import { WorkflowList } from './components/WorkflowList'
import { useWorkflowStore } from './store'

export default function App() {
  const detail = useWorkflowStore((state) => state.detail)
  const wsStatus = useWorkflowStore((state) => state.wsStatus)
  const error = useWorkflowStore((state) => state.error)
  const refreshList = useWorkflowStore((state) => state.refreshList)
  const connectWs = useWorkflowStore((state) => state.connectWs)
  const startWorkflow = useWorkflowStore((state) => state.startWorkflow)
  const decide = useWorkflowStore((state) => state.decide)

  useEffect(() => {
    void refreshList()
    return connectWs()
  }, [refreshList, connectWs])

  const awaitingStep =
    detail?.steps.find((step) => step.status === 'awaiting_approval') ?? null
  const reviewArtifact =
    detail?.artifacts.find((artifact) => artifact.name === '04-review.md') ?? null
  const planArtifact =
    detail?.artifacts
      .filter((artifact) => artifact.name === '01-plan.md')
      .sort((a, b) => b.version - a.version)[0] ?? null
  const canStart = detail !== null && detail.workflow.status === 'planning'

  return (
    <div className="app">
      <header className="titlebar">
        <span>研镜 Research Workbench</span>
        <span className={`ws-badge ws-${wsStatus}`}>WS {wsStatus}</span>
      </header>
      <div className="body">
        <WorkflowList />
        <main className="center">
          {error && <p className="error-banner">{error}</p>}
          {detail ? (
            <>
              <h1>{detail.workflow.goal}</h1>
              <p className="workflow-status">状态：{detail.workflow.status}</p>
              {canStart && (
                <button className="start-button" onClick={() => void startWorkflow()}>
                  启动工作流
                </button>
              )}
              <StepTimeline steps={detail.steps} />
              <ArtifactTabs artifacts={detail.artifacts} />
              {awaitingStep && (
                <ApprovalPanel
                  step={awaitingStep}
                  decisions={detail.decisions}
                  reviewContent={reviewArtifact?.content ?? null}
                  planContent={planArtifact?.content ?? null}
                  onDecide={(type, note) =>
                    void decide(awaitingStep.workflowId, awaitingStep.id, type, note)
                  }
                />
              )}
            </>
          ) : (
            <p className="placeholder">选择或新建一个工作流</p>
          )}
        </main>
        <EvidencePanel artifacts={detail?.artifacts ?? []} />
      </div>
    </div>
  )
}
