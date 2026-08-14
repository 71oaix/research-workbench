import { EventEmitter } from 'node:events'
import type { ServerEvent } from '@research-workbench/shared'

export interface WorkflowEventBus {
  on(listener: (event: ServerEvent) => void): () => void
  emit(event: ServerEvent): void
}

export function createEventBus(): WorkflowEventBus {
  const emitter = new EventEmitter()
  return {
    on(listener) {
      emitter.on('event', listener)
      return () => emitter.off('event', listener)
    },
    emit(event) {
      emitter.emit('event', event)
    },
  }
}
