import { describe, expect, it } from 'vitest'
import { createApp } from '../src/index'

describe('GET /health', () => {
  it('returns ok with db status', async () => {
    const app = createApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' })
  })
})
