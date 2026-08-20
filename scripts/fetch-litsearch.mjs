/**
 * 获取 LitSearch 查询子集（HF datasets-server，princeton-nlp/LitSearch），写入 data/eval/litsearch-queries.jsonl。
 * 用法：npx tsx scripts/fetch-litsearch.mjs [--rows 30]
 * 网络不可用时静默失败（可离线放置文件，README 已注明口径）。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'data', 'eval', 'litsearch-queries.jsonl')
const ROWS = Number(process.argv.find((_, index, all) => all[index - 1] === '--rows') ?? 30)

async function main() {
  const url =
    `https://datasets-server.huggingface.co/rows?dataset=princeton-nlp%2FLitSearch` +
    `&config=query&split=full&offset=0&length=${Math.min(ROWS, 100)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) {
    throw new Error(`LitSearch 拉取失败（HTTP ${response.status}）`)
  }
  const data = await response.json()
  const rows = data?.rows ?? []
  const lines = rows
    .map((entry, index) => {
      const row = entry?.row ?? {}
      const relevant = Array.isArray(row.relevant)
        ? row.relevant
        : Array.isArray(row.paper_ids)
          ? row.paper_ids
          : undefined
      return JSON.stringify({
        id: `lit-${index + 1}`,
        query: row.query ?? row.question ?? '',
        ...(relevant ? { relevant } : {}),
      })
    })
    .filter((line) => line && JSON.parse(line).query)
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, lines.join('\n') + '\n')
  console.log(`已写入 ${lines.length} 条 LitSearch 查询：${OUT}`)
}

main().catch((error) => {
  console.error(`LitSearch 获取失败（可离线放置文件后手动跳过）：${error.message}`)
  process.exit(1)
})
