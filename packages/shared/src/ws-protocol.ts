import type {
  Artifact,
  Decision,
  Paper,
  Step,
  UsageRecord,
  Workflow,
} from './types'

export type ServerEvent =
  | { type: 'hello' }
  | { type: 'workflow.created'; workflow: Workflow }
  | { type: 'workflow.updated'; workflow: Workflow }
  | { type: 'step.updated'; step: Step }
  | { type: 'artifact.updated'; artifact: Artifact }
  | { type: 'paper.created'; paper: Paper }
  | { type: 'decision.created'; decision: Decision }
  | { type: 'usage.recorded'; usage: UsageRecord }
  | { type: 'error'; message: string }

export type ClientEvent =
  | { type: 'ping'; ts: number }
  | { type: 'workflow.list' }
  | { type: 'workflow.get'; workflowId: string }
