import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PiConfigError, loadPiConfig, resolvePiAgentDir } from '../src/runtime/piConfig'

describe('loadPiConfig', () => {
  it('uses opencode-go / deepseek-v4-flash as defaults', () => {
    const config = loadPiConfig({})
    expect(config.provider).toBe('opencode-go')
    expect(config.defaultModel).toBe('deepseek-v4-flash')
    expect(config.apiKey).toBeUndefined()
    expect(config.agentDir).toBe(path.resolve(process.cwd(), '.pi', 'agent'))
  })

  it('isolates pi sessions in a dedicated agent dir with override support', () => {
    expect(resolvePiAgentDir({})).toBe(path.resolve(process.cwd(), '.pi', 'agent'))
    expect(resolvePiAgentDir({ PI_WORKBENCH_AGENT_DIR: 'C:/tmp/pi-isolated' })).toBe(
      path.resolve('C:/tmp/pi-isolated')
    )
  })

  it('reads role overrides', () => {
    const config = loadPiConfig({
      OPENCODE_GO_API_KEY: 'sk-test',
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
})
