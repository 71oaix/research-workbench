/**
 * M2-4 手动验证脚本：真实调用 deepseek-v4-flash + 真实学术检索 + 证据引用写作与核查。
 * 四步全部等待审批，逐步放行。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-4.mjs
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

function extractCardIds(cardsMd) {
  return [...cardsMd.matchAll(/^###\s*\[(\d{1,4})\]/gm)].map((m) => Number(m[1]))
}

function extractCitationIds(md) {
  return [...md.matchAll(/\[(\d{1,4})\]/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0)
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  log('创建四步工作流（全部等待审批）')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  const id = created.workflow.id
  log(`已创建 ${id}`)

  log('start：执行 planner（真实模型调用）')
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  const done = await approveUntilDone(id, started)
  log(
    `完成 → ${done.workflow.status} | ${done.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )

  const artifacts = Object.fromEntries(done.artifacts.map((a) => [a.name, a.content]))
  const cards = artifacts['research-cards.md'] ?? ''
  const research = artifacts['02-research.md'] ?? ''
  const draft = artifacts['03-draft.md'] ?? ''
  const lint = artifacts['citation-lint.md'] ?? ''
  const review = artifacts['04-review.md'] ?? ''

  const cardIds = extractCardIds(cards)
  const citedIds = [...new Set(extractCitationIds(draft))]
  const invalidIds = citedIds.filter((n) => !cardIds.includes(n))
  console.log(
    `卡片数=${cardIds.length}，草稿引用=${citedIds.join(', ')}，越界=${invalidIds.join(', ') || '无'}`
  )

  if (cardIds.length < 10) throw new Error(`research-cards.md 卡片数 ${cardIds.length} < 10`)
  if (citedIds.length < 5) throw new Error(`03-draft.md 引用编号数 ${citedIds.length} < 5`)
  if (invalidIds.length > 0) throw new Error(`越界引用：${invalidIds.join(', ')}`)
  if (!draft.includes('参考文献')) throw new Error('03-draft.md 缺少参考文献列表')
  if (!lint.includes('引用检查报告')) throw new Error('缺少 citation-lint.md')
  for (const part of ['可信引用清单', '存疑引用与原因', '覆盖不足的方向']) {
    if (!review.includes(part)) throw new Error(`04-review.md 缺少“${part}”`)
  }
  void research
  console.log(`artifacts=${done.artifacts.length} decisions=${done.decisions.length}`)
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
