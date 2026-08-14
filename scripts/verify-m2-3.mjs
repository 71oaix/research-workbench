/**
 * M2-3 手动验证脚本：真实调用 deepseek-v4-flash + 真实学术检索（Semantic Scholar / OpenAlex）。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 建议（可选）：配置 OPENALEX_MAILTO 与 SEMANTIC_SCHOLAR_API_KEY 提升限流表现。
 * 用法：node scripts/verify-m2-3.mjs
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

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  const papersBefore = await countPapers()
  log('创建四步工作流')
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

  const planner = started.steps.find((s) => s.role === 'planner')
  log('批准计划 → 执行 researcher（真实检索）/ writer / reviewer')
  const afterPlan = await jsonFetch(`${base}/workflows/${id}/steps/${planner.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'approve', note: '计划可行' }),
  })
  log(
    `批准计划 → ${afterPlan.workflow.status} | ${afterPlan.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )

  const plan = afterPlan.artifacts.find((a) => a.name === '01-plan.md')
  console.log('--- 01-plan.md 前 25 行 ---')
  console.log(plan.content.split('\n').slice(0, 25).join('\n'))
  console.log('包含"检索关键词":', plan.content.includes('检索关键词'))

  const cards = afterPlan.artifacts.find((a) => a.name === 'research-cards.md')
  const research = afterPlan.artifacts.find((a) => a.name === '02-research.md')
  console.log('--- research-cards.md 前 20 行 ---')
  console.log(cards?.content.split('\n').slice(0, 20).join('\n') ?? '（缺失）')
  console.log('--- 02-research.md 前 40 行 ---')
  console.log(research?.content.split('\n').slice(0, 40).join('\n') ?? '（缺失）')

  const cardCount = (research?.content.match(/^###\s*\[/gm) ?? []).length
  const rawCardCount = (cards?.content.match(/^###\s*\[/gm) ?? []).length
  console.log(
    `research-cards.md 卡片数=${rawCardCount}，02-research.md 卡片数=${cardCount}`
  )
  if (!cards) throw new Error('缺少 research-cards.md，检索步骤未产出证据卡片')
  if (cardCount < 10) throw new Error(`02-research.md 卡片数 ${cardCount} < 10`)
  if (!research?.content.includes('检索概览')) throw new Error('02-research.md 缺少检索概览')
  if (!research?.content.includes('失败源')) throw new Error('02-research.md 缺少失败源说明')

  const reviewer = afterPlan.steps.find((s) => s.role === 'reviewer')
  log('批准审查')
  const done = await jsonFetch(`${base}/workflows/${id}/steps/${reviewer.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'approve' }),
  })
  log(
    `批准审查 → ${done.workflow.status} | ${done.steps
      .map((s) => `${s.role}:${s.status}`)
      .join(' ')}`
  )
  console.log(`artifacts=${done.artifacts.length} decisions=${done.decisions.length}`)

  const papersAfter = await countPapers()
  if (papersBefore !== null && papersAfter !== null) {
    console.log(`papers 表变化：${papersBefore} -> ${papersAfter}`)
  }
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exit(1)
})
