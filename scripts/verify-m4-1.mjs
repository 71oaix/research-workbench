/**
 * M4-1 手动验证脚本：模型辅助覆盖判定 v2 真实流程验证。
 * 前置：本地服务已启动，且进程带有 OPENCODE_GO_API_KEY。
 * 用法：node scripts/verify-m4-1.mjs
 * 输出：新跑工作流的 coverage-matrix.md 行判定，并与最近一个含覆盖矩阵的历史工作流对比。
 */

const base = process.env.API_BASE ?? 'http://localhost:3000'
const GOAL = '研究下多智能体的记忆架构'

const WORKFLOW = {
  goal: GOAL,
  steps: [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: true },
    { label: '筛选证据', role: 'selector', requiresApproval: false },
    { label: '撰写综述', role: 'writer', requiresApproval: true },
    { label: '评估证据', role: 'evaluator', requiresApproval: false },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
    { label: '归纳整理', role: 'summarizer', requiresApproval: false },
  ],
}

const CLARIFICATION_ANSWER =
  '我关注的是大语言模型驱动的多智能体系统（如 AutoGen、CrewAI、MetaGPT 等 LLM 多智能体框架）的记忆架构，' +
  '领域是计算机科学。具体想了解：各框架的记忆机制设计（短期/长期/共享记忆）、记忆的存储与检索方式、' +
  '经验积累与反思机制，以及相关的评测基准，时间范围近 5 年。'

async function jsonFetch(url, options, timeoutMs = 700000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
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

const log = (...args) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

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
          log('planner 请求澄清，提交答案')
          current = await decide(id, awaiting.id, 'modify', CLARIFICATION_ANSWER)
        } else {
          log(`审批 ${awaiting.label}（approve）`)
          try {
            current = await decide(id, awaiting.id, 'approve')
          } catch {
            // 长步骤期间 HTTP 连接可能被掐断：审批已在服务端生效，仅刷新状态
            log(`[连接中断] ${awaiting.label} 审批请求断开，等待后在轮询中确认`)
            await new Promise((resolve) => setTimeout(resolve, 30000))
            current = await jsonFetch(`${base}/workflows/${id}`, {}, 30000)
            if (
              current.workflow.status === 'executing' ||
              (current.workflow.status === 'paused' &&
                current.steps.find((step) => step.status === 'awaiting_approval')?.id === awaiting.id)
            ) {
              // 若仍停在原步骤说明审批未生效，补发一次
              if (current.steps.find((step) => step.status === 'awaiting_approval')?.id === awaiting.id) {
                log(`重发审批 ${awaiting.label}`)
                current = await decide(id, awaiting.id, 'approve')
              }
            }
          }
        }
      } catch (error) {
        log(`[断线恢复] ${awaiting.label}: ${error.message}；30s 后刷新状态`)
        await new Promise((resolve) => setTimeout(resolve, 30000))
        current = await jsonFetch(`${base}/workflows/${id}`, {}, 30000)
      }
    } else if (current.workflow.status === 'executing') {
      await new Promise((resolve) => setTimeout(resolve, 20000))
      current = await jsonFetch(`${base}/workflows/${id}`, {}, 30000)
    } else {
      break
    }
  }
  return { detail: current, clarified }
}

function parseMatrix(md) {
  const rows = [...md.matchAll(/^\|\s*(\d+)\.\s*(.+?)\s*\|\s*(covered|partial|missing)\s*\|(.+)\|$/gm)]
  return rows.map((match) => ({
    id: Number(match[1]),
    question: match[2],
    coverage: match[3],
    papers: match[4].trim(),
  }))
}

async function findPreviousMatrix(excludeId) {
  const list = await jsonFetch(`${base}/workflows`, {}, 30000)
  const items = list.workflows ?? list ?? []
  for (const item of items) {
    if (!item.id || item.id === excludeId) continue
    if (!['completed', 'cancelled'].includes(item.status)) continue
    try {
      const detail = await jsonFetch(`${base}/workflows/${item.id}`, {}, 30000)
      const matrix = (detail.artifacts ?? []).find((artifact) => artifact.name === 'coverage-matrix.md')
      if (matrix && !matrix.content.includes('判定依据') ) {
        // 历史矩阵也打印来源与目标以便对照
        return { id: item.id, goal: detail.workflow.goal, md: matrix.content }
      }
      if (matrix) return { id: item.id, goal: detail.workflow.goal, md: matrix.content }
    } catch {
      continue
    }
  }
  return null
}

async function main() {
  log('创建七步完整工作流（M4-1 v2 模型复核生效分支）')
  const created = await jsonFetch(
    `${base}/workflows`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(WORKFLOW),
    },
    30000
  )
  const id = created.workflow.id
  log(`workflow=${id}`)
  const t0 = Date.now()
  const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' }, 30000)
  const { detail: done, clarified } = await approveUntilDone(id, started)
  const elapsed = Math.round((Date.now() - t0) / 1000)
  log(`工作流结束 status=${done.workflow.status} 耗时=${elapsed}s 澄清=${clarified}`)

  const matrixArtifact = (done.artifacts ?? []).find((artifact) => artifact.name === 'coverage-matrix.md')
  const cardsMd = (done.artifacts.find((artifact) => artifact.name === 'research-cards.md')?.content ?? '')

  console.log('\n===== 本次运行（v2 模型复核） =====')
  console.log(`goal=${GOAL}｜id=${id}｜status=${done.workflow.status}｜耗时=${elapsed}s`)
  console.log(`命中/去重=${(cardsMd.match(/命中 \/ 去重：(\d+) \/ (\d+)/) ?? []).slice(1).join('/') || '?'}｜筛选=${(cardsMd.split('\n').find((line) => line.startsWith('- 筛选：')) ?? '').trim()}`)

  let fail = false
  if (!matrixArtifact) {
    console.log('FAIL 未生成 coverage-matrix.md')
    fail = true
  } else {
    const rows = parseMatrix(matrixArtifact.content)
    for (const row of rows) {
      console.log(`[${row.coverage.padEnd(8)}] ${row.id}. ${row.question.slice(0, 50)} → 论文: ${row.papers.slice(0, 60) || '（无）'}`)
    }
    const covered = rows.filter((row) => row.coverage === 'covered').length
    console.log(`\n小计：covered=${covered}/${rows.length}`)
    if (rows.length === 0) fail = true

    const prev = await findPreviousMatrix(id)
    if (prev) {
      console.log(`\n===== 历史对照（${prev.id}｜${String(prev.goal ?? '').slice(0, 30)}） =====`)
      const prevRows = parseMatrix(prev.md)
      for (const row of prevRows) {
        console.log(`[${row.coverage.padEnd(8)}] ${row.id}. ${row.question.slice(0, 50)} → 论文: ${row.papers.slice(0, 60) || '（无）'}`)
      }
    } else {
      console.log('\n历史对照：未找到可对比的旧矩阵')
    }
  }

  if (!['completed', 'failed'].includes(done.workflow.status)) fail = true
  process.exitCode = fail ? 1 : 0
}

main().catch((error) => {
  console.error('验证失败:', error.message)
  process.exit(1)
})
