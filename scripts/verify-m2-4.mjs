/**
 * M2-4 手动验证脚本：真实调用 deepseek-v4-flash + 真实学术检索 + 证据引用写作与核查。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 建议（可选）：配置 OPENALEX_MAILTO 与 SEMANTIC_SCHOLAR_API_KEY 提升限流表现。
 * 用法：node scripts/verify-m2-4.mjs
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
  log('批准计划 → 执行 researcher / writer / reviewer（真实检索与写作）')
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

  const artifacts = Object.fromEntries(
    afterPlan.artifacts.map((a) => [a.name, a.content])
  )
  const plan = artifacts['01-plan.md'] ?? ''
  const cards = artifacts['research-cards.md'] ?? ''
  const research = artifacts['02-research.md'] ?? ''
  const draft = artifacts['03-draft.md'] ?? ''
  const lint = artifacts['citation-lint.md'] ?? ''
  const review = artifacts['04-review.md'] ?? ''

  console.log('--- 01-plan.md 前 20 行 ---')
  console.log(plan.split('\n').slice(0, 20).join('\n'))
  console.log('--- 03-draft.md 前 40 行 ---')
  console.log(draft.split('\n').slice(0, 40).join('\n'))
  console.log('--- citation-lint.md ---')
  console.log(lint.split('\n').slice(0, 20).join('\n'))
  console.log('--- 04-review.md 前 30 行 ---')
  console.log(review.split('\n').slice(0, 30).join('\n'))

  const cardIds = extractCardIds(cards)
  const citedIds = [...new Set(extractCitationIds(draft))]
  const invalidIds = citedIds.filter((n) => !cardIds.includes(n))
  const researchCardCount = (research.match(/^###\s*\[/gm) ?? []).length
  console.log(
    `research-cards.md 卡片数=${cardIds.length}，02-research.md 卡片数=${researchCardCount}，` +
      `草稿引用次数=${extractCitationIds(draft).length}，去重编号=${citedIds.join(', ')}，` +
      `越界编号=${invalidIds.join(', ') || '无'}`
  )

  if (!cards) throw new Error('缺少 research-cards.md')
  if (!draft) throw new Error('缺少 03-draft.md')
  if (researchCardCount < 10) throw new Error(`02-research.md 卡片数 ${researchCardCount} < 10`)
  if (citedIds.length < 5) throw new Error(`03-draft.md 引用编号数 ${citedIds.length} < 5`)
  if (invalidIds.length > 0) throw new Error(`03-draft.md 存在越界引用编号：${invalidIds.join(', ')}`)
  if (!draft.includes('参考文献')) throw new Error('03-draft.md 缺少参考文献列表')
  if (!lint.includes('引用检查报告')) throw new Error('缺少 citation-lint.md')
  for (const part of ['可信引用清单', '存疑引用与原因', '覆盖不足的方向']) {
    if (!review.includes(part)) throw new Error(`04-review.md 缺少“${part}”`)
  }

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
