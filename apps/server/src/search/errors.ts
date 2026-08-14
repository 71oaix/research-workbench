import { EngineError } from '../engine/WorkflowEngine'

export class SearchError extends EngineError {
  constructor(message: string) {
    super(message, 500)
  }
}
