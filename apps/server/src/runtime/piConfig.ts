import path from 'node:path'
import type { Role } from '@research-workbench/shared'

export class PiConfigError extends Error {}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

export interface PiConfig {
  apiKey: string | undefined
  provider: string
  /** OpenAI 兼容端点根地址；默认 DeepSeek 官方，可经 DEEPSEEK_BASE_URL 指向兼容中转 */
  baseUrl: string
  defaultModel: string
  roleModel: Partial<Record<Role, string>>
  thinkingLevel: ThinkingLevel
  roleThinkingLevel: Partial<Record<Role, ThinkingLevel>>
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
  const provider = env.PI_PROVIDER ?? 'deepseek'
  const defaultModel = env.PI_DEFAULT_MODEL ?? 'deepseek-v4-flash'
  const roleModel: Partial<Record<Role, string>> = {}
  const roleThinkingLevel: Partial<Record<Role, ThinkingLevel>> = {}
  for (const role of ['planner', 'researcher', 'selector', 'writer', 'evaluator', 'reviewer'] as const) {
    const value = env[`PI_MODEL_${role.toUpperCase()}`]
    if (value) {
      if (value.includes('/')) {
        throw new PiConfigError(
          `PI_MODEL_${role.toUpperCase()} 只接受模型 ID（provider 由 PI_PROVIDER 统一指定）`
        )
      }
      roleModel[role] = value
    }
    const thinking = env[`PI_THINKING_${role.toUpperCase()}`]
    if (thinking) {
      roleThinkingLevel[role] = parseThinkingLevel(
        thinking,
        `PI_THINKING_${role.toUpperCase()}`
      )
    }
  }
  return {
    apiKey: env.DEEPSEEK_API_KEY,
    provider,
    baseUrl: normalizeBaseUrl(env.DEEPSEEK_BASE_URL),
    defaultModel,
    roleModel,
    thinkingLevel: parseThinkingLevel(env.PI_THINKING_LEVEL, 'PI_THINKING_LEVEL'),
    roleThinkingLevel,
    agentDir: resolvePiAgentDir(env),
  }
}

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

/** baseUrl 规范化：去尾斜杠；空/未设置回退官方端点 */
export function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_DEEPSEEK_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function parseThinkingLevel(value: string | undefined, name: string): ThinkingLevel {
  if (value === undefined) return 'xhigh'
  const normalized = value.trim().toLowerCase() as ThinkingLevel
  if (!THINKING_LEVELS.includes(normalized)) {
    throw new PiConfigError(
      `${name} 只接受 ${THINKING_LEVELS.join(' / ')}（DeepSeek 最高档为 xhigh → max）`
    )
  }
  return normalized
}
