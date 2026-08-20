/**
 * M2-16 效果评测脚本（离线确定性检索 + 可选完整工作流核验率 + 基线对比）。
 * 用法：
 *   npx tsx scripts/eval-m2-15.mjs --limit 5
 *   npx tsx scripts/eval-m2-15.mjs --queries-file data/eval/queries.jsonl --out data/eval/report.md
 *   npx tsx scripts/eval-m2-15.mjs --baseline --limit 5        # 同时跑无迭代版基线对比
 *   npx tsx scripts/eval-m2-15.mjs --litsearch data/eval/litsearch-queries.jsonl
 *   npx tsx scripts/eval-m2-15.mjs --workflow 2                # 跑 2 个完整工作流（需服务在线）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AcademicSearchService } from '../apps/server/src/search/AcademicSearchService.ts'
import { loadSearchConfig } from '../apps/server/src/search/config.ts'
import { buildSourceRegistry } from '../apps/server/src/search/sources.ts'
import { normalizeTitle } from '../apps/server/src/search/merge.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_QUERIES = path.join(root, 'data', 'eval', 'queries.jsonl')
const DEFAULT_GOLD = path.join(root, 'data', 'eval', 'gold.jsonl')
const RECALL_TOP = 20

function parseArgs(argv) {
  const args = {
    limit: Infinity,
    queriesFile: DEFAULT_QUERIES,
    goldFile: DEFAULT_GOLD,
    out: null,
    workflow: 0,
    baseline: false,
    litsearch: null,
  }
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--limit' && value) args.limit = Number(value)
    if (key === '--queries-file' && value) args.queriesFile = value
    if (key === '--gold-file' && value) args.goldFile = value
    if (key === '--out' && value) args.out = value
    if (key === '--workflow' && value) args.workflow = Number(value)
    if (key === '--baseline') args.baseline = true
    if (key === '--litsearch' && value) args.litsearch = value
  }
  return args
}

function readJsonl(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

/**
 * mode='full'：子问题 + 检索关键词 + 时间范围（RefChain/时间过滤生效）；
 * mode='baseline'：只有检索关键词（无子问题合并、无时间过滤），模拟“无迭代版”。
 */
function buildPlanMd(query, mode) {
  const lines = ['# 评测检索计划', '', '## 研究问题', query.query, '', '## 检索关键词', `- ${query.query}`]
  if (mode !== 'baseline') {
    lines.splice(4, 0, '## 子问题', `- ${query.query}`)
  }
  if (query.domain === 'cs') {
    lines.push('', '## 锚定点', '- 领域：计算机科学（cs / agent / llm / model / network / algorithm）')
  }
  if (query.yearFrom && mode !== 'baseline') {
    lines.push('', '## 锚定点', `- 时间范围：${query.yearFrom} 年以后`)
  }
  return lines.join('\n')
}

function titleHit(title, abstract, gold) {
  const norm = normalizeTitle(`${title} ${abstract ?? ''}`)
  if (!norm) return null
  return (
    gold.findIndex((g) => {
      const normGold = normalizeTitle(g)
      return normGold && (norm === normGold || norm.includes(normGold) || normGold.includes(norm))
    }) ?? -1
  )
}

async function runOffline(queries, goldMap, mode) {
  // recall@20 需要至少 20 篇候选：检索阶段放宽 topN
  const config = { ...loadSearchConfig(), topN: 20 }
  const service = new AcademicSearchService(buildSourceRegistry(config), config)
  const rows = []
  for (const query of queries) {
    const t0 = Date.now()
    let output
    try {
      output = await service.search(buildPlanMd(query, mode))
    } catch (error) {
      rows.push({ id: query.id, query: query.query, error: error.message, elapsedMs: Date.now() - t0 })
      continue
    }
    const top = output.papers.slice(0, RECALL_TOP)
    const gold = goldMap.get(query.id) ?? []
    const matchedGold = new Set()
    for (const paper of top) {
      const index = titleHit(paper.title, paper.abstract, gold)
      if (index >= 0) matchedGold.add(index)
    }
    const hits = matchedGold.size
    rows.push({
      id: query.id,
      query: query.query,
      elapsedMs: Date.now() - t0,
      queryGroups: output.stats.queryGroups,
      queries: output.stats.queries,
      gapQueries: output.stats.gapQueries ?? 0,
      totalHits: output.stats.totalHits,
      uniquePapers: output.stats.uniquePapers,
      failedSources: output.stats.failedSources,
      goldSize: gold.length,
      recall20: gold.length > 0 ? hits / gold.length : null,
      hits,
    })
  }
  return rows
}

async function runWorkflows(count) {
  const base = process.env.API_BASE ?? 'http://localhost:3000'
  const steps = [
    { label: '生成检索计划', role: 'planner', requiresApproval: true },
    { label: '检索文献', role: 'researcher', requiresApproval: true },
    { label: '筛选证据', role: 'selector', requiresApproval: false },
    { label: '撰写综述', role: 'writer', requiresApproval: true },
    { label: '评估证据', role: 'evaluator', requiresApproval: false },
    { label: '审查引用', role: 'reviewer', requiresApproval: true },
  ]
  const goals = ['研究下多智能体的记忆架构', '检索增强生成 RAG 在科研写作中的应用']
  const results = []
  for (let i = 0; i < Math.min(count, goals.length); i++) {
    const created = await jsonFetch(`${base}/workflows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: goals[i], steps }),
    })
    const id = created.workflow.id
    const started = await jsonFetch(`${base}/workflows/${id}/start`, { method: 'POST' })
    const done = await approveUntilDone(base, id, started)
    const cards = done.artifacts.find((a) => a.name === 'research-cards.md')
    const verification = done.artifacts.find((a) => a.name === 'citation-verification.md')
    const verified = Number((verification?.content.match(/Verified (\d+)/) ?? [])[1] ?? 0)
    const total = Number((verification?.content.match(/引用条数：(\d+)/) ?? [])[1] ?? 0)
    results.push({
      id,
      goal: goals[i],
      status: done.workflow.status,
      cards: cards?.content ?? '',
      verified,
      total,
      verifyRate: total > 0 ? verified / total : null,
    })
  }
  return results
}

async function jsonFetch(url, options, timeoutMs = 700000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function getDetail(base, id) {
  return jsonFetch(`${base}/workflows/${id}`, {}, 30000)
}

async function approveUntilDone(base, id, detail) {
  let current = detail
  while (true) {
    if (current.workflow.status === 'paused') {
      const awaiting = current.steps.find((step) => step.status === 'awaiting_approval')
      if (!awaiting) break
      try {
        current = await jsonFetch(`${base}/workflows/${id}/steps/${awaiting.id}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'approve' }),
        })
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 30000))
        current = await getDetail(base, id)
      }
    } else if (current.workflow.status === 'executing') {
      await new Promise((resolve) => setTimeout(resolve, 30000))
      current = await getDetail(base, id)
    } else {
      break
    }
  }
  return current
}

function renderOfflineReport(rows) {
  const lines = [
    '# 检索效果评测报告（M2-16）',
    '',
    `- 时间：${new Date().toISOString()}`,
    `- 查询数：${rows.length}（离线确定性检索，recall@${RECALL_TOP}）`,
    '',
    '| id | 查询 | 耗时(s) | 查询组 | 请求数 | gap | 命中 | 去重 | 金标 | recall@20 | 失败源 |',
    '|----|------|---------|--------|--------|-----|------|------|------|-----------|--------|',
  ]
  const recallValues = []
  for (const row of rows) {
    if (row.error) {
      lines.push(`| ${row.id} | ${row.query} | - | - | - | - | - | - | - | FAIL: ${row.error} | - |`)
      continue
    }
    const recall = row.recall20 === null ? '-' : `${(row.recall20 * 100).toFixed(0)}%`
    if (row.recall20 !== null) recallValues.push(row.recall20)
    lines.push(
      `| ${row.id} | ${row.query} | ${(row.elapsedMs / 1000).toFixed(1)} | ${row.queryGroups} | ${row.queries} | ${row.gapQueries} | ${row.totalHits} | ${row.uniquePapers} | ${row.goldSize} | ${recall} | ${row.failedSources.join('、') || '无'} |`
    )
  }
  const avg =
    recallValues.length > 0
      ? recallValues.reduce((sum, value) => sum + value, 0) / recallValues.length
      : null
  lines.push(
    '',
    `- 平均 recall@20：${avg === null ? '（无金标）' : (avg * 100).toFixed(1) + '%'}（${recallValues.length}/${rows.length} 条有金标）`,
    '',
    '> precision 需要人工抽检：金标集合有限，recall 为保守口径。',
  )
  return lines.join('\n')
}

function renderBaselineReport(rows, baselineRows) {
  const byId = new Map(baselineRows.map((row) => [row.id, row]))
  const lines = [
    '# 检索效果对比报告（全量版 vs 无迭代基线）',
    '',
    `- 时间：${new Date().toISOString()}`,
    '- 基线口径：仅关键词组（无子问题合并 / 时间过滤 / 引文雪球 / 相关度分级排序）；同义词扩展为生产行为保留',
    '',
    '| id | 查询 | 全量 recall@20 | 基线 recall@20 | Δ | 全量命中 | 基线命中 | 全量查询数 | 基线查询数 |',
    '|----|------|---------------|----------------|----|----------|----------|------------|------------|',
  ]
  const fullValues = []
  const baseValues = []
  for (const row of rows) {
    const base = byId.get(row.id)
    const fullRecall = row.recall20 ?? null
    const baseRecall = base?.recall20 ?? null
    if (fullRecall !== null) fullValues.push(fullRecall)
    if (baseRecall !== null) baseValues.push(baseRecall)
    const delta =
      fullRecall !== null && baseRecall !== null
        ? `${((fullRecall - baseRecall) * 100).toFixed(1)}pp`
        : '-'
    lines.push(
      `| ${row.id} | ${row.query} | ${fullRecall === null ? '-' : (fullRecall * 100).toFixed(0) + '%'} | ${baseRecall === null ? '-' : (baseRecall * 100).toFixed(0) + '%'} | ${delta} | ${row.uniquePapers} | ${base?.uniquePapers ?? '-'} | ${row.queries} | ${base?.queries ?? '-'} |`
    )
  }
  const avg = (values) =>
    values.length > 0
      ? ((values.reduce((sum, value) => sum + value, 0) / values.length) * 100).toFixed(1) + '%'
      : '-'
  lines.push(
    '',
    `- 平均 recall@20：全量 ${avg(fullValues)} vs 基线 ${avg(baseValues)}（${fullValues.length} 条有金标）`,
    '',
    '> 本对比不覆盖 selector 分级排序与引文雪球（需完整工作流核验率口径，见 --workflow）。',
  )
  return lines.join('\n')
}

function renderWorkflowReport(rows) {
  const lines = [
    '# 完整工作流核验率报告（M2-16）',
    '',
    `- 时间：${new Date().toISOString()}`,
    '',
    '| id | 目标 | 状态 | 卡片 | Verified | 引用总数 | 核验率 |',
    '|----|------|------|------|----------|----------|--------|',
  ]
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.goal} | ${row.status} | ${row.cards.length} 字符 | ${row.verified} | ${row.total} | ${row.verifyRate === null ? '-' : (row.verifyRate * 100).toFixed(0) + '%'} |`
    )
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const queries = args.litsearch
    ? readJsonl(args.litsearch)
        .slice(0, args.limit)
        .map((row, index) => ({
          id: String(row.id ?? `lit-${index + 1}`),
          query: row.query ?? '',
          gold: row.relevant ?? [],
        }))
    : readJsonl(args.queriesFile).slice(0, args.limit)
  const goldMap = args.litsearch
    ? new Map(queries.map((row) => [row.id, row.gold]))
    : new Map(readJsonl(args.goldFile).map((row) => [row.id, row.gold ?? []]))
  let report = ''
  if (args.workflow > 0) {
    report = renderWorkflowReport(await runWorkflows(args.workflow))
  } else if (args.baseline) {
    const [rows, baselineRows] = await Promise.all([
      runOffline(queries, goldMap, 'full'),
      runOffline(queries, goldMap, 'baseline'),
    ])
    report = renderBaselineReport(rows, baselineRows)
  } else {
    report = renderOfflineReport(await runOffline(queries, goldMap, 'full'))
  }
  if (args.out) {
    mkdirSync(path.dirname(args.out), { recursive: true })
    writeFileSync(args.out, report)
  }
  process.stdout.write(report)
}

main().catch((error) => {
  console.error('评测失败:', error.message)
  process.exit(1)
})
