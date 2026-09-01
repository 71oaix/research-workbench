import { describe, expect, it, vi } from 'vitest'
import { loadPiConfig } from '../src/runtime/piConfig'
import { PiRuntimeProvider } from '../src/runtime/PiRuntimeProvider'

const { fromServicesSpy, runtimeFactorySpy, registeredModels, setRuntimeApiKeySpy } = vi.hoisted(() => ({
  fromServicesSpy: vi.fn(async (_options: Record<string, unknown>) => ({})),
  runtimeFactorySpy: vi.fn(async (_factory: unknown) => ({ session: {} })),
  setRuntimeApiKeySpy: vi.fn(),
  registeredModels: [] as {
    id: string
    thinkingLevelMap?: Record<string, string>
    compat?: { supportsDeveloperRole?: boolean }
  }[],
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  AuthStorage: { create: () => ({ setRuntimeApiKey: setRuntimeApiKeySpy }) },
  ModelRegistry: {
    create: () => ({
      find: (provider: string, id: string) =>
        registeredModels.find((model) => model.id === id) ?? { id },
      registerProvider: (
        _provider: string,
        config: {
          models: {
            id: string
            thinkingLevelMap?: Record<string, string>
            compat?: { supportsDeveloperRole?: boolean }
          }[]
        }
      ) => {
        registeredModels.splice(0, registeredModels.length, ...config.models)
      },
    }),
  },
  SessionManager: { create: () => ({}) },
  createAgentSessionRuntime: runtimeFactorySpy,
  createAgentSessionServices: vi.fn(async () => ({})),
  createAgentSessionFromServices: fromServicesSpy,
}))

describe('PiRuntimeProvider thinking level', () => {
  it('passes xhigh thinking level and the max mapping to the pi session', async () => {
    const provider = new PiRuntimeProvider(loadPiConfig({ DEEPSEEK_API_KEY: 'sk-test' }))
    runtimeFactorySpy.mockImplementation(
      (async (factory: (ctx: unknown) => Promise<unknown>) => {
        await factory({ cwd: process.cwd(), sessionManager: {}, sessionStartEvent: {} })
        return { session: {}, services: {} }
      }) as never
    )

    await provider.createRuntime('writer', 'system prompt')

    const args = fromServicesSpy.mock.calls[0]?.[0] as {
      thinkingLevel?: string
      model?: { thinkingLevelMap?: Record<string, string> }
    }
    expect(args?.thinkingLevel).toBe('xhigh')
    expect(args?.model?.thinkingLevelMap).toMatchObject({ high: 'high', xhigh: 'max' })
  })

  it('honors per-role thinking level overrides', async () => {
    const provider = new PiRuntimeProvider(
      loadPiConfig({ DEEPSEEK_API_KEY: 'sk-test', PI_THINKING_REVIEWER: 'high' })
    )
    runtimeFactorySpy.mockImplementation(
      (async (factory: (ctx: unknown) => Promise<unknown>) => {
        await factory({ cwd: process.cwd(), sessionManager: {}, sessionStartEvent: {} })
        return { session: {}, services: {} }
      }) as never
    )

    await provider.createRuntime('reviewer', 'system prompt')
    const args = fromServicesSpy.mock.calls.at(-1)?.[0] as { thinkingLevel?: string }
    expect(args?.thinkingLevel).toBe('high')
  })

  it('registers models with supportsDeveloperRole=false for OpenAI-compatible relays', async () => {
    new PiRuntimeProvider(loadPiConfig({ DEEPSEEK_API_KEY: 'sk-test' }))
    for (const model of registeredModels) {
      expect(model).toMatchObject({ compat: { supportsDeveloperRole: false } })
    }
  })

  it('overrides authStorage runtime key with the configured API key', async () => {
    new PiRuntimeProvider(loadPiConfig({ DEEPSEEK_API_KEY: 'sk-test' }))
    expect(setRuntimeApiKeySpy).toHaveBeenCalledWith('deepseek', 'sk-test')
  })
})
