/**
 * M2-10 手动验证脚本：真实流程 + concern ledger + evaluation-report。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m2-10.mjs
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

  const review = done.artifacts.find((artifact) => artifact.name === '04-review.md')
  const evaluation = done.artifacts.find(
    (artifact) => artifact.name === 'evaluation-report.md'
  )
  const lint = done.artifacts.find((artifact) => artifact.name === 'citation-lint.md')
  const reviewMd = review?.content ?? ''
  const evaluationMd = evaluation?.content ?? ''

  console.log(`workflow=${done.workflow.status}`)
  console.log(`04-review.md 含 Concern Ledger=${reviewMd.includes('### C')}`)
  console.log(`evaluation-report.md 存在=${Boolean(evaluation)}`)
  console.log(`evaluation 含四指标=${['主题匹配', '平均相关度', '大纲覆盖', '来源失败'].every((k) => evaluationMd.includes(k))}`)

  if (done.workflow.status !== 'completed') throw new Error('工作流未 completed')
  if (!reviewMd.includes('### C')) throw new Error('04-review.md 缺少 Concern Ledger')
  if (!lint) throw new Error('缺少 citation-lint.md')
  if (!evaluation) throw new Error('缺少 evaluation-report.md')
  for (const part of ['主题匹配', '平均相关度', '大纲覆盖', '来源失败']) {
    if (!evaluationMd.includes(part)) throw new Error(`evaluation-report.md 缺少“${part}”`)
  }
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
