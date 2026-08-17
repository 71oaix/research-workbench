import { describe, expect, it } from 'vitest'
import { PiRuntimeHandle } from '../src/runtime/PiRuntimeProvider'

describe('PiRuntimeHandle timeout', () => {
  it('rejects with a timeout error when the model call hangs', async () => {
    process.env.PI_STEP_TIMEOUT_MS = '50'
    try {
      const runtime = {
        session: {
          messages: [],
          prompt: () => new Promise(() => {}),
          dispose: () => {},
        },
      }
      const handle = new PiRuntimeHandle(
        runtime as unknown as ConstructorParameters<typeof PiRuntimeHandle>[0],
        'writer'
      )
      await expect(handle.send('prompt')).rejects.toThrow('模型调用超时')
    } finally {
      delete process.env.PI_STEP_TIMEOUT_MS
    }
  })
})
