import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const req = createRequire('C:/Users/10636/Desktop/Pi-WorkSpace/projects/active/research-workbench/apps/server/package.json')
process.chdir('C:/Users/10636/Desktop/Pi-WorkSpace/projects/active/research-workbench')

const Database = req('better-sqlite3')
const db = new Database('data/app.db', { readonly: true })

const wfId = '2e4d0d85'
const getArtifact = (name) =>
  db
    .prepare(
      'select content from artifacts where workflow_id like ? and name = ? order by version desc limit 1'
    )
    .get(`${wfId}%`, name)

const plan = getArtifact('01-plan.md').content
const cardsJson = JSON.parse(getArtifact('research-candidates.json')?.content ?? '{}')
const papers = cardsJson.papers ?? []
console.log(`plan=${plan.length} chars, candidatePool=${papers.length} papers`)

const { buildCoverageMatrix } = await import('./apps/server/src/search/coverage.ts')
const { parseJudgeOutput, buildJudgePrompt } = await import('./apps/server/src/search/coverageJudge.ts')

// ---- A: 纯规则（v1 行为）----
const rule = buildCoverageMatrix(plan, papers)
console.log('\n[A] 纯规则判定：')
for (const row of rule.rows) {
  console.log(`  [${row.coverage}] ${row.question.slice(0, 28)}… 论文:${row.papers.join(',') || '-'} gap=${row.gapQuery.slice(0, 20)}`)
}

// ---- B: 模型精判（全量行送审，直接用 pi 会话）----
const pending = rule.rows
console.log(`\n[B] 全量送模型精判的行数: ${pending.length}`)
if (pending.length > 0) {
  const keyLine = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((line) => line.includes('='))
  const apiKey = keyLine.slice(keyLine.indexOf('=') + 1).trim()
  process.env.OPENCODE_GO_API_KEY = apiKey

  const { PiRuntimeProvider } = await import('./apps/server/src/runtime/PiRuntimeProvider.ts')
  const provider = new PiRuntimeProvider({
    agentDir: '.pi-judge-probe',
    apiKey,
    provider: 'opencode-go',
    defaultModel: 'deepseek-v4-flash',
    roleModel: {},
    thinkingLevel: 'high',
    roleThinkingLevel: {},
  })
  const handle = await provider.createRuntime(
    'selector',
    '你是学术调研工作台的覆盖判定员。你只做一件事：判断子问题是否被候选论文支撑。输出只有一个 JSON 数组。'
  )
  const prompt =
    buildJudgePrompt(
      pending.map((row) => ({ id: row.id, question: row.question })),
      papers.map((paper, index) => ({ id: index + 1, title: paper.title, abstract: paper.abstract ?? '' })),
      []
    ) +
    '\n\n只输出 JSON 数组 [{"id":N,"coverage":"covered|partial|missing","papers":[编号]}]，无任何其他文字。'
  const out = await handle.send(prompt)
  await handle.close()
  const verdicts = parseJudgeOutput(out, papers.length)
  console.log(`模型返回 ${verdicts.length} 条判定:`)
  for (const verdict of verdicts) {
    const before = rule.rows.find((row) => row.id === verdict.id)?.coverage
    console.log(`  id=${verdict.id}: ${before} -> ${verdict.coverage}  papers=[${verdict.papers}]`)
  }
}
