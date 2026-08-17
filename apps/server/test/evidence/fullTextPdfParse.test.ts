import { describe, expect, it } from 'vitest'

describe('pdf-parse real module', () => {
  it('loads the pdf-parse implementation without the debug-module crash', async () => {
    const mod = await import('pdf-parse/lib/pdf-parse.js')
    expect(typeof mod.default).toBe('function')
  })
})
