/**
 * M2-3 手动验证脚本：真实调用 deepseek-v4-flash + 真实学术检索（Semantic Scholar / OpenAlex）。
 * 四步全部等待审批，逐步放行。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-3.mjs
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

async function countPapers() {
  try {
    const { default: Database } = await import('better-sqlite3')
    const dbPath = process.env.DB_PATH ?? 'data/app.db'
    const db = new Database(dbPath, { readonly: true })
    const row = db.prepare('SELECT COUNT(*) AS n FROM papers').get()
    db.close()
    return row.n
  } catch {
    return null
  }
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
  const papersBefore = await countPapers()
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
  log(
    `start → ${started.workflow.status} | ${started.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )

  const done = await approveUntilDone(id, started)
  log(
    `完成 → ${done.workflow.status} | ${done.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )

  const artifacts = Object.fromEntries(done.artifacts.map((a) => [a.name, a.content]))
  const plan = artifacts['01-plan.md'] ?? ''
  const cards = artifacts['research-cards.md'] ?? ''
  const research = artifacts['02-research.md'] ?? ''
  const cardCount = (cards.match(/^###\s*\[/gm) ?? []).length
  const researchCardCount = (research.match(/^###\s*\[/gm) ?? []).length
  console.log(`plan 含检索关键词=${plan.includes('检索关键词')}`)
  console.log(`research-cards.md 卡片数=${cardCount}，02-research.md 卡片数=${researchCardCount}`)
  if (cardCount < 10) throw new Error(`research-cards.md 卡片数 ${cardCount} < 10`)

  const papersAfter = await countPapers()
  if (papersBefore !== null && papersAfter !== null) {
    console.log(`papers 表变化：${papersBefore} -> ${papersAfter}`)
  }
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
