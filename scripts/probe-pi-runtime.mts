/**
 * 模型运行时诊断探针：用当前环境配置真实跑一次 PiRuntimeProvider，
 * 拦截并打印发往模型端点的 HTTP 请求/响应，输出解析后的 model 对象、
 * 会话事件序列与最终消息（含 errorMessage / usage）。
 * 适合排查「换 key / 换端点后模型调用静默失败」类问题。
 *
 * 用法：node --env-file=.env.local --import tsx scripts/probe-pi-runtime.mts
 * 可选：环境变量加 PI_THINKING_LEVEL=xhigh 验证思考档
 */
import { loadPiConfig } from '../apps/server/src/runtime/piConfig'
import { PiRuntimeProvider } from '../apps/server/src/runtime/PiRuntimeProvider'

// --- 拦截 fetch，记录发往 dashscope 的请求与响应 ---
const realFetch = globalThis.fetch
let captured = 0
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const [input, init] = args
  const url = typeof input === 'string' ? input : (input as Request).url
  if (url.includes('dashscope') || url.includes('deepseek.com')) {
    captured++
    const bodyPreview = typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body) ?? ''
    console.log(`[http] >>> ${init?.method ?? 'GET'} ${url}`)
    console.log(`[http] >>> auth=${(init?.headers as Record<string, string> | undefined)?.['Authorization']?.slice(0, 14)}…`)
    console.log(`[http] >>> body=${bodyPreview.slice(0, 900)}`)
    try {
      const res = await realFetch(input, init)
      const cloned = res.clone()
      const text = await cloned.text()
      console.log(`[http] <<< HTTP ${res.status} ${text.slice(0, 700).replace(/\n/g, ' | ')}`)
      return res
    } catch (e) {
      console.log(`[http] <<< NET_ERR ${(e as Error).cause?.message ?? (e as Error).message}`)
      throw e
    }
  }
  return realFetch(input, init)
}) as typeof fetch

const config = loadPiConfig()
const provider = new PiRuntimeProvider(config)

const handle = await provider.createRuntime('planner', '你是探针测试助手，回答务必简短。')
const events: string[] = []
const unsubscribe = handle.runtime.session.subscribe((event) => {
  events.push((event as { type?: string }).type ?? 'unknown')
})
try {
  const text = await handle.send('只回复四个字：探针正常')
  console.log('[probe] 回复 =', JSON.stringify(text.slice(0, 100)))
} finally {
  unsubscribe?.()
}
console.log('[probe] 事件序列 =', JSON.stringify(events.slice(0, 30)), 'capturedHttp =', captured)

const messages = handle.runtime.session.messages as Array<Record<string, unknown>>
for (const m of messages.slice(-2)) {
  console.log('[probe] msg =', JSON.stringify(m).slice(0, 1200))
}
await handle.close()