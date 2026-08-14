/**
 * M2-6 手动验证脚本：四步全部等待审批，先打回计划一次，再逐步放行到完成。
 * 验证多轮迭代：打回后 01-plan.md 出现 v2，且最终流程 completed。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m2-6.mjs
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'

const workflow = {
  goal: '调研大语言模型在软件测试中的应用',
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
    log(`审批 ${awaiting.role}`)
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
  const planner = started.steps.find((step) => step.role === 'planner')

  log('打回计划：补充“上下文工程”方向')
  const afterModify = await jsonFetch(`${base}/workflows/${id}/steps/${planner.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'modify', note: '补充“上下文工程”方向的子问题' }),
  })
  if (afterModify.workflow.status !== 'paused') {
    throw new Error(`打回后工作流状态应为 paused，实际 ${afterModify.workflow.status}`)
  }
  const planVersions = afterModify.artifacts.filter((a) => a.name === '01-plan.md').length
  console.log(`01-plan.md 版本数=${planVersions}`)
  if (planVersions < 2) throw new Error('打回后 01-plan.md 未生成新版本')

  const done = await approveUntilDone(id, afterModify)
  log(
    `完成 → ${done.workflow.status} | ${done.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )
  console.log(`artifacts=${done.artifacts.length} decisions=${done.decisions.length}`)
  if (done.workflow.status !== 'completed') throw new Error('工作流未 completed')
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
