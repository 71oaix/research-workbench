/**
 * M2-7 手动验证脚本：真实调用 deepseek-v4-flash + 分级学术检索 + 打回补偿。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m2-7.mjs
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'

const workflow = {
  goal: '调研大语言模型多智能体系统的记忆架构',
  steps: [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: true },
    { label: '撰写综述', role: 'writer', requiresApproval: true },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
  ],
}

async function jsonFetch(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(300000) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function approveUntilDone(id, detail) {
  let current = detail
  while (current.workflow.status === 'paused') {
    const awaiting = current.steps.find((step) => step.status === 'awaiting_approval')
    if (!awaiting) break
    current = await jsonFetch(`${base}/workflows/${id}/steps/${awaiting.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'approve' }),
    })
  }
  return current
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  log('创建四步工作流')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  const id = created.workflow.id

  let detail = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  const planner = detail.steps.find((step) => step.role === 'planner')
  detail = await jsonFetch(`${base}/workflows/${id}/steps/${planner.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'approve', note: '计划可行' }),
  })

  const researcher = detail.steps.find((step) => step.role === 'researcher')
  log('打回检索：论文太少，扩大检索')
  detail = await jsonFetch(`${base}/workflows/${id}/steps/${researcher.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'modify', note: '论文太少、引用数低，请扩大检索' }),
  })

  const cardsVersions = detail.artifacts.filter((artifact) => artifact.name === 'research-cards.md').length
  console.log(`research-cards.md 版本数=${cardsVersions}`)
  if (cardsVersions < 2) throw new Error('打回后未生成新版本的证据卡片')

  const done = await approveUntilDone(id, detail)
  const cards = done.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const cardsMd = cards?.content ?? ''
  console.log(`workflow=${done.workflow.status}`)
  console.log(`含“关键词组 / 查询数”=${cardsMd.includes('关键词组 / 查询数')}`)
  console.log(`含“失败源”=${cardsMd.includes('失败源')}`)
  if (done.workflow.status !== 'completed') throw new Error('工作流未 completed')
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
