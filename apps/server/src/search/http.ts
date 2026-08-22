import type { RateLimiter } from './rateLimiter'

export class SearchHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly nonRetryable = false
  ) {
    super(message)
  }
}

export interface FetchJsonOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  maxRetries?: number
  rateLimiter?: RateLimiter
  retryDelayMs?: (attempt: number, response?: Response) => number
}

export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxRetries = options.maxRetries ?? 3

  for (let attempt = 0; ; attempt++) {
    await options.rateLimiter?.acquire()

    let response: Response | null = null
    try {
      response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      if (attempt >= maxRetries) {
        throw new SearchHttpError(0, `network_error: ${String(e)}`)
      }
      await sleep(options.retryDelayMs?.(attempt, undefined) ?? 1000)
      continue
    }

    if (response.ok) {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        throw new SearchHttpError(response.status, 'invalid_json')
      }
    }

    if (response.status === 429 || response.status >= 500) {
      const body = await readBody(response)
      // 预算型 429（如 OpenAlex 计费余额不足）重试不可能成功，快速失败并标记不可重试
      if (response.status === 429 && isNonRetryableRateLimit(body)) {
        throw new SearchHttpError(response.status, body || 'rate_limited_non_retryable', true)
      }
      if (attempt >= maxRetries) {
        throw new SearchHttpError(response.status, body)
      }
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      const delay =
        options.retryDelayMs?.(attempt, response) ?? retryAfter ?? 1000
      await sleep(delay)
      continue
    }

    throw new SearchHttpError(response.status, await readBody(response))
  }
}

/**
 * 识别"重试无意义"的 429：OpenAlex 计费制下预算/额度耗尽
 * （body 含 insufficient budget / add funds / prepaidRemaining / credits remaining）。
 */
function isNonRetryableRateLimit(body: string): boolean {
  return /insufficient budget|prepaidremaining|add funds|credits? remaining|onetimecreditsremaining/i.test(
    body
  )
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds * 1000), 60_000)
  }
  const date = Date.parse(value)
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), 60_000)
  }
  return null
}

async function readBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 200)
  } catch {
    return ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
