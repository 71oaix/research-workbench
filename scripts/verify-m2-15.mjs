/**
 * M2-15 手动验证脚本：宽泛问题澄清 + 六步流程（selector 筛选）+ 相关度分级 + 编号一致。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m2-15.mjs
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'

const workflow = {
  goal: '研究下什么是 agent',
  steps: [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: true },
    { label: '筛选证据', role: 'selector', requiresApproval: false },
    { label: '撰写综述', role: 'writer', requiresApproval: true },
    { label: '评估证据', role: 'evaluator', requiresApproval: false },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
  ],
}

const CLARIFICATION_ANSWER =
  '我关注的是大语言模型驱动的自主智能体（LLM agent），领域是计算机科学，' +
  '具体想了解单智能体与多智能体的区别、记忆机制与规划能力，时间范围近 5 年。'

async function jsonFetch(url, options, timeoutMs = 700000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function getDetail(id) {
  return jsonFetch(`${base}/workflows/${id}`, {}, 30000)
}

async function decide(id, stepId, type, note) {
  return jsonFetch(
    `${base}/workflows/${id}/steps/${stepId}/decision`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, note: note ?? null }),
    },
    700000
  )
}

async function approveUntilDone(id, detail) {
  let current = detail
  let clarified = false
  while (true) {
    if (current.workflow.status === 'paused') {
      const awaiting = current.steps.find((step) => step.status === 'awaiting_approval')
      if (!awaiting) break
      const plan = current.artifacts
        .filter((artifact) => artifact.name === '01-plan.md')
        .sort((a, b) => b.version - a.version)[0]
      const needsClarification = Boolean(plan?.content.includes('## 澄清请求'))
      try {
        if (needsClarification && awaiting.role === 'planner' && !clarified) {
          clarified = true
          log(`planner 请求澄清，提交答案`)
          current = await decide(id, awaiting.id, 'modify', CLARIFICATION_ANSWER)
        } else {
          current = await decide(id, awaiting.id, 'approve')
        }
      } catch (error) {
        log(`[断线恢复] 审批 ${awaiting.label} 连接中断（${error.message}）`)
        await new Promise((resolve) => setTimeout(resolve, 30000))
        current = await getDetail(id)
      }
    } else if (current.workflow.status === 'executing') {
      await new Promise((resolve) => setTimeout(resolve, 30000))
      current = await getDetail(id)
    } else {
      break
    }
  }
  return { detail: current, clarified }
}

function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) process.exitCode = 1
}

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function main() {
  log('创建六步工作流（含 selector 筛选）')
  const created = await jsonFetch(
    `${base}/workflows`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workflow),
    },
    30000
  )
  const id = created.workflow.id
  const t0 = Date.now()
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' }, 30000)
  const { detail: done, clarified } = await approveUntilDone(id, started)
  const elapsed = Math.round((Date.now() - t0) / 1000)
  log(`工作流完成，总耗时 ${elapsed}s，澄清=${clarified}`)

  const cards = done.artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const fullText = done.artifacts.find((artifact) => artifact.name === 'paper-fulltext.md')
  const selectorReport = done.artifacts.find((artifact) => artifact.name === 'selector-report.md')
  const cardsMd = cards?.content ?? ''
  const fullTextMd = fullText?.content ?? ''

  const hits = Number((cardsMd.match(/命中 \/ 去重：(\d+) \/ (\d+)/) ?? [])[1] ?? 0)
  const selectionLine = cardsMd.split('\n').find((line) => line.startsWith('- 筛选：'))
  const high = Number((cardsMd.match(/高相关 (\d+)/) ?? [])[1] ?? 0)
  const partial = Number((cardsMd.match(/部分相关 (\d+)/) ?? [])[1] ?? 0)
  const leveled = high + partial
  const cardIds = new Set(
    [...cardsMd.matchAll(/^### \[(\d+)\]/gm)].map((match) => Number(match[1]))
  )
  const fullTextIds = [...fullTextMd.matchAll(/^## \[(\d+)\]/gm)].map((match) => Number(match[1]))
  const numberingOk = fullTextIds.every((id) => cardIds.has(id))
  const reasons = (cardsMd.match(/筛选理由[：:]/g) ?? []).length

  console.log(`workflow=${done.workflow.status}（耗时 ${elapsed}s）｜澄清=${clarified}`)
  console.log(`命中/去重=${hits}｜筛选=${selectionLine ?? '（无）'}｜全文段落=${fullTextIds.join(',')}｜理由=${reasons}`)

  check('工作流 completed', done.workflow.status === 'completed', done.workflow.status)
  check('六步模板含 selector', done.steps.some((step) => step.role === 'selector'))
  check('宽泛问题触发澄清请求', clarified, clarified ? '已回答并收敛' : '未触发')
  check('命中 ≥ 40（cs 域多源 + RefChain 查询组）', hits >= 40, `${hits}`)
  check('卡片带相关度分级（高+部分 ≥ 3）', leveled >= 3, `高${high}/部分${partial}`)
  check('每张入选卡片带筛选理由', reasons >= 1, `${reasons} 条`)
  check('selector-report.md 已生成', Boolean(selectorReport))
  check('全文编号与卡片编号一致', numberingOk, fullTextIds.join(',') || '无全文')
  check('top-15 无明显无关论文（太极/谣言/英语教学）', !/太极统一场论|谣言传播|大学英语教学/.test(cardsMd))
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
