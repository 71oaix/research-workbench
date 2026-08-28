/**
 * M2-11 打回路径验证：Writer 步骤打回一次，验证 v2 生成与结构 diff 数据。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-11-modify.mjs
 */

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

async function jsonFetch(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(300000) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function decide(id, stepId, type, note) {
  return jsonFetch(`${base}/workflows/${id}/steps/${stepId}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, note: note ?? null }),
  })
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

function headings(md) {
  return (md.match(/^#{2,3} .+$/gm) ?? []).map((h) => h.replace(/^#+\s*/, '').trim())
}

function refs(md) {
  return [...new Set([...md.matchAll(/\[(\d{1,4})\]/g)].map((m) => m[1]))]
}

async function main() {
  log('创建四步工作流')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  const id = created.workflow.id

  let detail = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  const byRole = (role) => detail.steps.find((s) => s.role === role)

  log('审批 planner')
  detail = await decide(id, byRole('planner').id, 'approve')
  log('审批 researcher')
  detail = await decide(id, byRole('researcher').id, 'approve')

  log('打回 writer（要求基于全文深入重写）')
  detail = await decide(
    id,
    byRole('writer').id,
    'modify',
    '综述太浅，请基于已读全文深入重写，突出记忆机制与实现细节'
  )
  const drafts = detail.artifacts.filter((a) => a.name === '03-draft.md')
  const v1 = drafts.find((a) => a.version === 1)?.content ?? ''
  const v2 = drafts.find((a) => a.version === 2)?.content ?? ''
  console.log(`打回后 03-draft 版本数=${drafts.length}（v1 ${v1.length} 字符，v2 ${v2.length} 字符）`)
  if (drafts.length < 2) throw new Error('打回后未生成 v2')

  const v1Heads = headings(v1)
  const v2Heads = headings(v2)
  const v1Refs = refs(v1)
  const v2Refs = refs(v2)
  const removed = v1Heads.filter((h) => !v2Heads.includes(h))
  const added = v2Heads.filter((h) => !v1Heads.includes(h))
  console.log(`结构 diff：移除章节 ${removed.length}，新增章节 ${added.length}，引用变化 ${v1Refs.filter((r) => !v2Refs.includes(r)).length} 删 ${v2Refs.filter((r) => !v1Refs.includes(r)).length} 增`)
  if (removed.length === 0 && added.length === 0 && v1Refs.join() === v2Refs.join()) {
    throw new Error('v1/v2 结构无任何差异，diff 无可展示')
  }

  log('审批 writer v2')
  detail = await decide(id, byRole('writer').id, 'approve')
  log('审批 reviewer')
  detail = await decide(id, byRole('reviewer').id, 'approve')

  const cards = detail.artifacts.find((a) => a.name === 'research-cards.md')?.content ?? ''
  const fullTextRead = (cards.match(/全文：已读 (\d+)/) ?? [])[1] ?? '0'
  console.log(`workflow=${detail.workflow.status}，全文已读=${fullTextRead}`)
  if (detail.workflow.status !== 'completed') throw new Error('工作流未 completed')
  if (Number(fullTextRead) < 1) throw new Error(`全文已读 ${fullTextRead} < 1`)
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
