/**
 * M2-13 手动验证脚本：真实五步流程（含 evaluator）+ 核验通过率 + 模型评估 + 下载覆盖。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-13.mjs
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'

const workflow = {
  goal: '研究下多智能体的记忆架构',
  steps: [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: true },
    { label: '撰写综述', role: 'writer', requiresApproval: true },
    { label: '评估证据', role: 'evaluator', requiresApproval: false },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
  ],
}

async function jsonFetch(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(600000) })
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

function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) process.exitCode = 1
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  log('创建五步工作流（含 evaluator）')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  const id = created.workflow.id
  const t0 = Date.now()
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
  const done = await approveUntilDone(id, started)
  const elapsed = Math.round((Date.now() - t0) / 1000)
  log(`工作流完成，总耗时 ${elapsed}s`)

  const cards = done.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const evaluation = done.artifacts.find((artifact) => artifact.name === 'evaluation-report.md')
  const verification = done.artifacts.find(
    (artifact) => artifact.name === 'citation-verification.md'
  )
  const cardsMd = cards?.content ?? ''
  const evaluationMd = evaluation?.content ?? ''
  const verificationMd = verification?.content ?? ''

  const read = Number((cardsMd.match(/全文：已读 (\d+)/) ?? [])[1] ?? 0)
  const failed = Number((cardsMd.match(/失败 (\d+) \/ 无开放获取/) ?? [])[1] ?? 0)
  const noOa = Number((cardsMd.match(/无开放获取 (\d+) \/ 仅摘要/) ?? [])[1] ?? 0)
  const skipped = (cardsMd.match(/过滤损坏元数据：(\d+) 篇/) ?? [])[1] ?? '0'
  const statusCounts = {
    verified: (verificationMd.match(/Verified (\d+)/) ?? [])[1] ?? '0',
    check: (verificationMd.match(/Check suggested (\d+)/) ?? [])[1] ?? '0',
    fix: (verificationMd.match(/Needs fix (\d+)/) ?? [])[1] ?? '0',
    unverifiable: (verificationMd.match(/Unverifiable (\d+)/) ?? [])[1] ?? '0',
  }
  const resolvable =
    Number(statusCounts.verified) + Number(statusCounts.check) + Number(statusCounts.fix)
  const total =
    resolvable + Number(statusCounts.unverifiable)
  const verifyRate = total > 0 ? resolvable / total : 0

  console.log(`workflow=${done.workflow.status}（耗时 ${elapsed}s）`)
  console.log(`全文：已读 ${read} / 失败 ${failed} / 无开放获取 ${noOa} / 过滤损坏 ${skipped}`)
  console.log(`核验：Verified ${statusCounts.verified} / Check ${statusCounts.check} / Fix ${statusCounts.fix} / Unverifiable ${statusCounts.unverifiable}（可核验率 ${(verifyRate * 100).toFixed(0)}%）`)
  console.log(`评估报告由模型生成=${evaluationMd.includes('总体结论') || evaluationMd.includes('逐核心概念命中判定')}`)

  check('工作流 completed', done.workflow.status === 'completed', done.workflow.status)
  check('全文已读 ≥ 10 篇（全量下载生效）', read >= 10, `已读 ${read}`)
  check('下载失败 ≤ 2', failed <= 2, `失败 ${failed}`)
  check('核验可核验率 ≥ 60%', verifyRate >= 0.6, `${(verifyRate * 100).toFixed(0)}%`)
  check('评估报告含模型判定结构', /逐核心概念命中判定|逐卡相关度评分|大纲覆盖/.test(evaluationMd))
  check('评估报告含 gap 建议', evaluationMd.includes('gap') || evaluationMd.includes('覆盖不足'))
  check('评估报告不再含规则判定（通过（命中率））', !evaluationMd.includes('命中率'))
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
