import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
} from '@earendil-works/pi-coding-agent'
import type { Role } from '@research-workbench/shared'
import { EngineError } from '../engine/WorkflowEngine'
import type { PiConfig } from './piConfig'

export interface RuntimeUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costCny: number
}

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1'
const USD_TO_CNY = 7.25

export class PiRuntimeProvider {
  private readonly authStorage: AuthStorage
  private readonly modelRegistry: ModelRegistry
  private readonly runtimes = new Map<string, PiRuntimeHandle>()

  constructor(private readonly config: PiConfig) {
    mkdirSync(this.config.agentDir, { recursive: true })
    this.authStorage = AuthStorage.create()
    this.modelRegistry = ModelRegistry.create(this.authStorage)
    if (config.apiKey) {
      this.registerModels()
    }
  }

  async createRuntime(role: Role, systemPrompt: string): Promise<PiRuntimeHandle> {
    if (!this.config.apiKey) {
      throw new EngineError('OPENCODE_GO_API_KEY 未配置，无法调用模型', 503)
    }
    const modelId = this.config.roleModel[role] ?? this.config.defaultModel
    const model = this.modelRegistry.find(this.config.provider, modelId)
    if (!model) {
      throw new EngineError(`模型未找到: ${this.config.provider}/${modelId}`, 500)
    }

    const cwd = process.cwd()
    const sessionDir = resolveSessionDir(this.config.agentDir, cwd)
    const runtime = await createAgentSessionRuntime(
      async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
        const services = await createAgentSessionServices({
          cwd: sessionCwd,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
          resourceLoaderOptions: {
            noSkills: true,
            noExtensions: true,
            systemPromptOverride: () => systemPrompt,
          },
        })
        const result = await createAgentSessionFromServices({
          services,
          sessionManager,
          sessionStartEvent,
          model,
          noTools: 'all',
        })
        return { ...result, services, diagnostics: services.diagnostics }
      },
      {
        cwd,
        agentDir: this.config.agentDir,
        sessionManager: SessionManager.create(cwd, sessionDir),
      }
    )

    const handle = new PiRuntimeHandle(runtime, role)
    this.runtimes.set(handle.id, handle)
    return handle
  }

  takeUsage(handleId: string): RuntimeUsage | null {
    const handle = this.runtimes.get(handleId)
    return handle ? handle.takeUsage() : null
  }

  private registerModels(): void {
    const modelIds = new Set([
      this.config.defaultModel,
      ...Object.values(this.config.roleModel),
    ])
    this.modelRegistry.registerProvider(this.config.provider, {
      name: this.config.provider,
      baseUrl: OPENCODE_BASE_URL,
      apiKey: this.config.apiKey,
      authHeader: true,
      api: 'openai-completions',
      models: [...modelIds].map((id) => ({
        id,
        name: id,
        reasoning: true,
        input: ['text'] as ('text' | 'image')[],
        cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 65536,
      })),
    })
  }
}

function resolveSessionDir(agentDir: string, cwd: string): string {
  const safePath = `--${path
    .resolve(cwd)
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`
  return path.join(agentDir, 'sessions', safePath)
}

export class PiRuntimeHandle {
  readonly id: string
  private usage: RuntimeUsage | null = null

  constructor(
    readonly runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>,
    readonly role: Role
  ) {
    this.id = `pi-${crypto.randomUUID()}`
  }

  async send(prompt: string): Promise<string> {
    const before = this.runtime.session.messages.length
    const timeoutMs = Number(process.env.PI_STEP_TIMEOUT_MS ?? 300_000)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EngineError(`模型调用超时（${timeoutMs / 1000}s），已中断当前步骤`, 504)),
        timeoutMs
      )
    })
    try {
      await Promise.race([this.runtime.session.prompt(prompt), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
    this.usage = extractUsage(this.runtime.session.messages.slice(before))
    return extractLatestAssistantText(this.runtime.session.messages)
  }

  takeUsage(): RuntimeUsage | null {
    const usage = this.usage
    this.usage = null
    return usage
  }

  async close(): Promise<void> {
    try {
      this.runtime.session.dispose()
    } catch {
      /* 忽略释放错误 */
    }
  }
}

function extractLatestAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { content?: unknown }
    const content = message.content
    if (Array.isArray(content)) {
      const text = (content as { type?: string; text?: string }[])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text ?? '')
        .join('')
      if (text.trim()) return text
    } else if (typeof content === 'string') {
      if (content.trim()) return content
    }
  }
  return ''
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function extractUsage(messages: unknown[]): RuntimeUsage | null {
  for (const message of messages) {
    const usage = (message as { usage?: unknown }).usage as
      | Record<string, unknown>
      | undefined
    if (!usage) continue
    const costObj = usage.cost as { total?: number } | undefined
    const costUsd = num(usage.costUsd ?? usage.cost_usd ?? costObj?.total)
    return {
      inputTokens: num(usage.input ?? usage.inputTokens ?? usage.prompt_tokens),
      outputTokens: num(usage.output ?? usage.outputTokens ?? usage.completion_tokens),
      cacheReadTokens: num(
        usage.cacheRead ??
          usage.cacheReadTokens ??
          usage.prompt_cache_hit_tokens ??
          usage.cache_read_input_tokens
      ),
      cacheWriteTokens: num(
        usage.cacheWrite ??
          usage.cacheWriteTokens ??
          usage.prompt_cache_miss_tokens ??
          usage.cache_creation_input_tokens
      ),
      costCny: costUsd * USD_TO_CNY,
    }
  }
  return null
}
