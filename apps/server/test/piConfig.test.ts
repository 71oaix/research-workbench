import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PiConfigError, loadPiConfig, resolvePiAgentDir } from '../src/runtime/piConfig'

describe('loadPiConfig', () => {
  it('uses deepseek / deepseek-v4-flash as defaults', () => {
    const config = loadPiConfig({})
    expect(config.provider).toBe('deepseek')
    expect(config.defaultModel).toBe('deepseek-v4-flash')
    expect(config.thinkingLevel).toBe('xhigh')
    expect(config.apiKey).toBeUndefined()
    expect(config.agentDir).toBe(path.resolve(process.cwd(), '.pi', 'agent'))
  })

  it('reads thinking level defaults and role overrides', () => {
    const config = loadPiConfig({
      PI_THINKING_LEVEL: 'high',
      PI_THINKING_WRITER: 'xhigh',
    })
    expect(config.thinkingLevel).toBe('high')
    expect(config.roleThinkingLevel.writer).toBe('xhigh')
    expect(config.roleThinkingLevel.planner).toBeUndefined()
  })

  it('rejects unknown thinking levels', () => {
    expect(() => loadPiConfig({ PI_THINKING_LEVEL: 'max' })).toThrow(PiConfigError)
    expect(() => loadPiConfig({ PI_THINKING_PLANNER: 'ultra' })).toThrow(PiConfigError)
  })

  it('isolates pi sessions in a dedicated agent dir with override support', () => {
    expect(resolvePiAgentDir({})).toBe(path.resolve(process.cwd(), '.pi', 'agent'))
    expect(resolvePiAgentDir({ PI_WORKBENCH_AGENT_DIR: 'C:/tmp/pi-isolated' })).toBe(
      path.resolve('C:/tmp/pi-isolated')
    )
  })

  it('reads role overrides', () => {
    const config = loadPiConfig({
      DEEPSEEK_API_KEY: 'sk-test',
      PI_DEFAULT_MODEL: 'deepseek-v4-pro',
      PI_MODEL_PLANNER: 'deepseek-v4-flash',
      PI_MODEL_RESEARCHER: 'deepseek-v4-pro',
    })
    expect(config.apiKey).toBe('sk-test')
    expect(config.defaultModel).toBe('deepseek-v4-pro')
    expect(config.roleModel.planner).toBe('deepseek-v4-flash')
    expect(config.roleModel.researcher).toBe('deepseek-v4-pro')
    expect(config.roleModel.writer).toBeUndefined()
  })

  it('rejects provider-qualified role overrides', () => {
    expect(() =>
      loadPiConfig({ PI_MODEL_PLANNER: 'opencode-go/deepseek-v4-flash' })
    ).toThrow(PiConfigError)
  })

  it('normalizes DEEPSEEK_BASE_URL and falls back to official endpoint', () => {
    expect(loadPiConfig({}).baseUrl).toBe('https://api.deepseek.com')
    expect(loadPiConfig({ DEEPSEEK_BASE_URL: 'https://tokenrhythm.studio/v1/' }).baseUrl).toBe(
      'https://tokenrhythm.studio/v1'
    )
    expect(loadPiConfig({ DEEPSEEK_BASE_URL: '   ' }).baseUrl).toBe('https://api.deepseek.com')
  })
})
