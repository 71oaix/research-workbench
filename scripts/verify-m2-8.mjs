/**
 * M2-8 手动验证脚本：真实检索 + 全文下载 + 证据池 + 全文写作。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-8.mjs
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
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  const done = await approveUntilDone(id, started)

  const cards = done.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const fullText = done.artifacts.find((artifact) => artifact.name === 'paper-fulltext.md')
  const draft = done.artifacts.find((artifact) => artifact.name === '03-draft.md')
  const cardsMd = cards?.content ?? ''
  const fullTextRead = (cardsMd.match(/全文：已读/g) ?? []).length

  console.log(`workflow=${done.workflow.status}`)
  console.log(`全文已读卡片数=${fullTextRead}`)
  console.log(`paper-fulltext.md 存在=${Boolean(fullText)}`)
  console.log(`草稿含 claim-evidence map=${(draft?.content ?? '').includes('claim-evidence')}`)

  if (done.workflow.status !== 'completed') throw new Error('工作流未 completed')
  if (!fullText) throw new Error('缺少 paper-fulltext.md')
  if (!draft?.content.includes('claim-evidence')) throw new Error('草稿缺少 claim-evidence map')
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
