import path from 'node:path'
import type { Role } from '@research-workbench/shared'

export class PiConfigError extends Error {}

export interface PiConfig {
  apiKey: string | undefined
  provider: string
  defaultModel: string
  roleModel: Partial<Record<Role, string>>
  agentDir: string
}

export function resolvePiAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PI_WORKBENCH_AGENT_DIR?.trim()
  if (explicit) {
    return path.resolve(explicit)
  }
  return path.resolve(process.cwd(), '.pi', 'agent')
}

export function loadPiConfig(env: NodeJS.ProcessEnv = process.env): PiConfig {
  const provider = env.PI_PROVIDER ?? 'opencode-go'
  const defaultModel = env.PI_DEFAULT_MODEL ?? 'deepseek-v4-flash'
  const roleModel: Partial<Record<Role, string>> = {}
  for (const role of ['planner', 'researcher', 'writer', 'reviewer'] as const) {
    const value = env[`PI_MODEL_${role.toUpperCase()}`]
    if (value) {
      if (value.includes('/')) {
        throw new PiConfigError(
          `PI_MODEL_${role.toUpperCase()} 只接受模型 ID（provider 由 PI_PROVIDER 统一指定）`
        )
      }
      roleModel[role] = value
    }
  }
  return {
    apiKey: env.OPENCODE_GO_API_KEY,
    provider,
    defaultModel,
    roleModel,
    agentDir: resolvePiAgentDir(env),
  }
}
