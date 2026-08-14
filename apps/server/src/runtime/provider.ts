import type { Role } from '@research-workbench/shared'

export interface RuntimeHandle {
  id: string
  role: Role
  send(prompt: string): Promise<string>
  close(): Promise<void>
}

export interface AgentRuntimeProvider {
  readonly name: string
  createRuntime(role: Role, systemPrompt: string): Promise<RuntimeHandle>
}

/**
 * M1 占位实现：不调用任何模型，仅验证抽象接口可用。
 * M2 将接入 pi SDK / OpenAI 兼容 provider。
 */
export class NoopRuntimeProvider implements AgentRuntimeProvider {
  readonly name = 'noop'

  async createRuntime(role: Role, _systemPrompt: string): Promise<RuntimeHandle> {
    const id = `noop-${crypto.randomUUID()}`
    return {
      id,
      role,
      async send(prompt: string) {
        return `[noop:${role}] received: ${prompt}`
      },
      async close() {},
    }
  }
}
