// 探针：验证 DeepSeek v4-flash（opencode-go）是否返回 thinking 块
// 用法：key 已在进程环境（.env.local 由调用方注入）
import { loadPiConfig } from '../apps/server/src/runtime/piConfig'
import { PiRuntimeProvider } from '../apps/server/src/runtime/PiRuntimeProvider'

const config = loadPiConfig()
const provider = new PiRuntimeProvider(config)
const handle = await provider.createRuntime('planner', '你是学术调研规划助手，只输出 Markdown。')

const stats = { text: 0, thinking: 0, textChars: 0, thinkingChars: 0 }
const thinkingSample: string[] = []
let firstEvent: string | null = null

const result = await handle.send('研究问题：大模型幻觉的检测方法。请输出 3 条检索关键词，每行一个。', (kind, delta) => {
  stats[kind] += 1
  if (kind === 'text') stats.textChars += delta.length
  else {
    stats.thinkingChars += delta.length
    if (thinkingSample.length < 3) thinkingSample.push(delta.slice(0, 120))
  }
  if (!firstEvent) firstEvent = kind
})

console.log('=== 探针结果 ===')
console.log('text 帧数:', stats.text, '字符:', stats.textChars)
console.log('thinking 帧数:', stats.thinking, '字符:', stats.thinkingChars)
console.log('首帧类型:', firstEvent)
if (thinkingSample.length) {
  console.log('thinking 样本:')
  for (const sample of thinkingSample) console.log('  ·', sample.replaceAll('\n', '⏎'))
}
console.log('=== 输出前 300 字 ===')
console.log(result.slice(0, 300))
await handle.close()
process.exit(0)
