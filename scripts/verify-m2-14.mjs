/**
 * M2-14 手动验证脚本：真实五步流程 + 检索召回（≥40）+ 失败源噪音（≤5）+ 全文编号一致性。
 * 前置：本地服务已启动，且进程带有 DEEPSEEK_API_KEY。
 * 用法：node scripts/verify-m2-14.mjs
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

async function jsonFetch(url, options, timeoutMs = 700000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function getDetail(id) {
  return jsonFetch(`${base}/workflows/${id}`, {}, 30000)
}

async function approveUntilDone(id, detail) {
  let current = detail
  while (true) {
    if (current.workflow.status === 'paused') {
      const awaiting = current.steps.find((step) => step.status === 'awaiting_approval')
      if (!awaiting) break
      try {
        current = await jsonFetch(
          `${base}/workflows/${id}/steps/${awaiting.id}/decision`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'approve' }),
          }
        )
      } catch (error) {
        // 长请求可能被网络层掐断，但服务端会继续执行；重新拉取状态恢复
        console.error(`[断线恢复] 审批 ${awaiting.label} 的连接中断（${error.message}）`)
        await new Promise((resolve) => setTimeout(resolve, 30000))
        current = await getDetail(id)
      }
    } else if (current.workflow.status === 'executing') {
      // 某步骤仍在运行（如 reviewer 长任务），轮询等待下一审批点
      await new Promise((resolve) => setTimeout(resolve, 30000))
      current = await getDetail(id)
    } else {
      break
    }
  }
  return current
}

function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) process.exitCode = 1
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  log('创建五步工作流（cs 域 4 源 + 熔断）')
  const created = await jsonFetch(`${base}/workflows`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  }, 30000)
  const id = created.workflow.id
  const t0 = Date.now()
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' }, 30000)
  const done = await approveUntilDone(id, started)
  const elapsed = Math.round((Date.now() - t0) / 1000)
  log(`工作流完成，总耗时 ${elapsed}s`)

  const cards = done.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const fullText = done.artifacts.find((artifact) => artifact.name === 'paper-fulltext.md')
  const cardsMd = cards?.content ?? ''
  const fullTextMd = fullText?.content ?? ''

  const hits = Number((cardsMd.match(/命中 \/ 去重：(\d+) \/ (\d+)/) ?? [])[1] ?? 0)
  const unique = Number((cardsMd.match(/命中 \/ 去重：(\d+) \/ (\d+)/) ?? [])[2] ?? 0)
  const failedLine = cardsMd.split('\n').find((line) => line.includes('失败源'))
  const failedCount = failedLine && !failedLine.includes('失败源：无')
    ? failedLine.replace(/^.*失败源[：:]\s*/, '').split(/[、,，;；]/).filter(Boolean).length
    : 0
  const read = Number((cardsMd.match(/全文：已读 (\d+)/) ?? [])[1] ?? 0)

  // 全文编号与卡片编号一致性：paper-fulltext 的 [N] 必须是卡片编号集合的子集
  const cardIds = new Set(
    [...cardsMd.matchAll(/^### \[(\d+)\]/gm)].map((match) => Number(match[1]))
  )
  const fullTextIds = [...fullTextMd.matchAll(/^## \[(\d+)\]/gm)].map((match) => Number(match[1]))
  const numberingOk = fullTextIds.every((id) => cardIds.has(id))

  console.log(`workflow=${done.workflow.status}（耗时 ${elapsed}s）`)
  console.log(`命中/去重=${hits}/${unique}｜全文已读=${read}｜失败源=${failedCount} 条｜全文段落编号=${fullTextIds.join(',')}`)

  check('工作流 completed', done.workflow.status === 'completed', done.workflow.status)
  check('命中 ≥ 40（cs 域多源生效）', hits >= 40, `${hits}`)
  check('失败源 ≤ 5 条（源级熔断生效）', failedCount <= 5, `${failedCount}`)
  check('全文编号与卡片编号一致', numberingOk, fullTextIds.join(',') || '无全文')
  check('无“年份：未知”损坏卡片', !cardsMd.includes('年份：未知'))
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
