/**
 * M2-2 手动验证脚本：真实调用 deepseek-v4-flash 跑一个四步工作流。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m2-2.mjs
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'

const workflow = {
  goal: '调研大语言模型在软件测试中的应用',
  steps: [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: false },
    { label: '撰写综述', role: 'writer', requiresApproval: false },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
  ],
}

async function jsonFetch(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(300000) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
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
  log(`已创建: ${id}`)

  log('start：执行 planner（真实模型调用）')
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  log(`start → ${started.workflow.status} | ${started.steps.map((s) => `${s.role}:${s.status}`).join(' ')}`)

  const planner = started.steps.find((s) => s.role === 'planner')
  log('批准计划 → 执行 researcher/writer/reviewer')
  const afterPlan = await jsonFetch(`${base}/workflows/${id}/steps/${planner.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'approve', note: '计划可行' }),
  })
  log(`批准计划 → ${afterPlan.workflow.status} | ${afterPlan.steps.map((s) => `${s.role}:${s.status}`).join(' ')}`)

  const plan = afterPlan.artifacts.find((a) => a.name === '01-plan.md')
  console.log('--- 01-plan.md 前 25 行 ---')
  console.log(plan.content.split('\n').slice(0, 25).join('\n'))
  console.log('包含 DSML:', plan.content.includes('DSML'))
  console.log('包含“子问题”:', plan.content.includes('子问题'))
  console.log('包含“检索关键词”:', plan.content.includes('检索关键词'))
  console.log('包含“综述大纲”:', plan.content.includes('综述大纲'))

  const reviewer = afterPlan.steps.find((s) => s.role === 'reviewer')
  log('批准审查')
  const done = await jsonFetch(`${base}/workflows/${id}/steps/${reviewer.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'approve' }),
  })
  log(`批准审查 → ${done.workflow.status} | ${done.steps.map((s) => `${s.role}:${s.status}`).join(' ')}`)
  console.log(`artifacts=${done.artifacts.length} decisions=${done.decisions.length}`)
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
