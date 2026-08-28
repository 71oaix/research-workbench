/**
 * M2-9 手动验证脚本：真实检索 + 全文 + 证据写作 + 引用核验（Crossref 字段级交叉）。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-9.mjs
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

  const verification = done.artifacts.find(
    (artifact) => artifact.name === 'citation-verification.md'
  )
  const lint = done.artifacts.find((artifact) => artifact.name === 'citation-lint.md')

  console.log(`workflow=${done.workflow.status}`)
  console.log(`citation-lint.md 存在=${Boolean(lint)}`)
  console.log(`citation-verification.md 存在=${Boolean(verification)}`)

  if (done.workflow.status !== 'completed') throw new Error('工作流未 completed')
  if (!lint) throw new Error('缺少 citation-lint.md')
  if (!verification) throw new Error('缺少 citation-verification.md')

  const md = verification.content
  const hasReport = md.includes('引用核验报告')
  const hasSummary = md.includes('## 汇总')
  const hasDetail = md.includes('## 逐条核验')
  console.log(`报告含汇总=${hasSummary}，含逐条核验=${hasDetail}`)
  if (!hasReport) throw new Error('citation-verification.md 缺少报告标题')
  if (!hasSummary || !hasDetail) throw new Error('citation-verification.md 缺少分级报告结构')
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
