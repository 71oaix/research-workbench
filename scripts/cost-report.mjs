/**
 * 工作流成本报告：聚合 usage_records（API 调用次数 / token / ¥ / 耗时）。
 * 用法：
 *   npx tsx scripts/cost-report.mjs
 *   npx tsx scripts/cost-report.mjs --workflow <id> --out docs/research/cost-report.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { workflow: null, out: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--workflow' && argv[i + 1]) args.workflow = argv[i + 1]
    if (argv[i] === '--out' && argv[i + 1]) args.out = argv[i + 1]
  }
  return args
}

function openDb() {
  const dbPath = process.env.DB_PATH ?? path.join(root, 'data', 'app.db')
  const db = new Database(dbPath, { readonly: true })
  return db
}

function main() {
  const args = parseArgs(process.argv)
  const db = openDb()
  const where = args.workflow ? 'WHERE u.workflow_id = ?' : ''
  const params = args.workflow ? [args.workflow] : []
  const rows = db
    .prepare(
      `SELECT
         u.workflow_id,
         w.goal,
         COUNT(*) AS calls,
         SUM(u.input_tokens) AS input_tokens,
         SUM(u.output_tokens) AS output_tokens,
         SUM(u.cache_read_tokens) AS cache_read_tokens,
         SUM(u.cache_write_tokens) AS cache_write_tokens,
         SUM(u.cost_cny) AS cost_cny,
         MIN(u.created_at) AS started_at,
         MAX(u.created_at) AS ended_at
       FROM usage_records u
       LEFT JOIN workflows w ON w.id = u.workflow_id
       ${where}
       GROUP BY u.workflow_id, w.goal
       ORDER BY ended_at DESC`
    )
    .all(...params)

  const lines = [
    '# 工作流成本报告（usage_records 聚合）',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 统计范围：${args.workflow ? `工作流 ${args.workflow}` : '全部工作流'}`,
    '',
    '| 工作流 | 目标 | 调用次数 | 输入 token | 输出 token | 缓存读 | 缓存写 | 成本(¥) | 耗时(分) |',
    '|--------|------|----------|------------|------------|--------|--------|---------|----------|',
  ]
  for (const row of rows) {
    const start = new Date(row.started_at).getTime()
    const end = new Date(row.ended_at).getTime()
    const minutes = Number.isFinite(start) && Number.isFinite(end) ? ((end - start) / 60000).toFixed(1) : '-'
    lines.push(
      `| ${row.workflow_id} | ${(row.goal ?? '（无）').slice(0, 40)} | ${row.calls} | ${row.input_tokens} | ${row.output_tokens} | ${row.cache_read_tokens} | ${row.cache_write_tokens} | ${row.cost_cny.toFixed(3)} | ${minutes} |`
    )
  }
  const report = lines.join('\n') + '\n'
  if (args.out) {
    mkdirSync(path.dirname(args.out), { recursive: true })
    writeFileSync(args.out, report)
  }
  process.stdout.write(report)
  db.close()
}

main()
