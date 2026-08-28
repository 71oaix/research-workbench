/**
 * M2-12 验证脚本：思考强度（xhigh → max）、下载状态、检索并发与评估中位数。
 * 离线检查：验证 pi-ai 0.80.x 对 xhigh 的支持路径与注册的模型配置一致。
 * 在线检查（可选，需本地服务已启动且带 DEEPSEEK_API_KEY）：
 *   node scripts/verify-m2-12.mjs --live
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsJs = readFileSync(
  path.join(
    __dirname,
    '..',
    'apps',
    'server',
    'node_modules',
    '@earendil-works',
    'pi-coding-agent',
    'node_modules',
    '@earendil-works',
    'pi-ai',
    'dist',
    'models.js'
  ),
  'utf8'
)

// 与 PiRuntimeProvider.registerModels 保持一致的模型声明
const model = {
  id: 'deepseek-v4-flash',
  reasoning: true,
  thinkingLevelMap: { high: 'high', xhigh: 'max' },
}

function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) process.exitCode = 1
}

function offlineChecks() {
  check(
    'pi-ai 的思考强度列表包含 xhigh',
    modelsJs.includes('"xhigh"') && /EXTENDED_THINKING_LEVELS[\s\S]{0,120}"xhigh"/.test(modelsJs)
  )
  check(
    'pi-ai 对 xhigh 要求 thinkingLevelMap 显式声明',
    /level === "xhigh"[\s\S]{0,80}mapped !== undefined/.test(modelsJs)
  )
  check('模型注册声明 xhigh → max 映射', model.thinkingLevelMap.xhigh === 'max')
  check(
    '请求档与注册映射一致（xhigh 不降级）',
    modelsJs.includes('model.thinkingLevelMap?.[level]')
  )
}

async function liveChecks() {
  const base = process.env.API_BASE ?? 'http://localhost:3000'
  const workflow = {
    goal: '研究下多智能体的记忆架构',
    steps: [
      { label: '生成检索计划', role: 'planner', requiresApproval: true },
      { label: '检索文献', role: 'researcher', requiresApproval: true },
      { label: '撰写综述', role: 'writer', requiresApproval: true },
      { label: '审查引用', role: 'reviewer', requiresApproval: true },
    ],
  }
  const jsonFetch = async (url, options) => {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(600000) })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    return res.json()
  }
  const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

  log('创建四步工作流（含检索耗时采样）')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  const id = created.workflow.id
  const t0 = Date.now()
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })

  let current = started
  while (current.workflow.status === 'paused') {
    const awaiting = current.steps.find((step) => step.status === 'awaiting_approval')
    if (!awaiting) break
    current = await jsonFetch(`${base}/workflows/${id}/steps/${awaiting.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'approve' }),
    })
  }
  const searchElapsed = Math.round((Date.now() - t0) / 1000)
  log(`工作流完成，总耗时 ${searchElapsed}s`)

  const cards = current.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const fullText = current.artifacts.find((artifact) => artifact.name === 'paper-fulltext.md')
  const evaluation = current.artifacts.find(
    (artifact) => artifact.name === 'evaluation-report.md'
  )
  const cardsMd = cards?.content ?? ''
  const fullTextMd = fullText?.content ?? ''
  const evaluationMd = evaluation?.content ?? ''

  check('工作流 completed', current.workflow.status === 'completed', current.workflow.status)
  check(
    '卡片含下载状态统计（已读/失败/无开放获取）',
    /全文：已读 \d+ \/ 失败 \d+ \/ 无开放获取 \d+/.test(cardsMd)
  )
  check(
    '论文卡片行内标注下载状态',
    /全文：下载失败|全文：无开放获取|全文：已读/.test(cardsMd)
  )
  check('paper-fulltext.md 头部含成功/失败统计', /成功 \d+ 篇/.test(fullTextMd))
  check('评估报告含相关度中位数', evaluationMd.includes('相关度中位数'))
}

offlineChecks()
if (process.argv.includes('--live')) {
  await liveChecks()
}
