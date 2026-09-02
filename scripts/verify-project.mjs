import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const watchedPaths = ['data/pdfs-test', 'data/eval', 'data/app.db', 'data/app.db-shm', 'data/app.db-wal']

function snapshotPath(relativePath) {
  const absolute = path.join(root, relativePath)
  if (!existsSync(absolute)) return { exists: false }
  const stat = statSync(absolute)
  const files = []
  const collect = (file, rel) => {
    const item = statSync(file)
    if (item.isDirectory()) {
      for (const entry of readdirSync(file)) collect(path.join(file, entry), path.join(rel, entry))
      return
    }
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex')
    files.push({ path: rel.split(path.sep).join('/'), size: item.size, sha256: digest })
  }
  collect(absolute, relativePath)
  return { exists: true, files: files.sort((a, b) => a.path.localeCompare(b.path)) }
}

function snapshotWatched() {
  return Object.fromEntries(watchedPaths.map((item) => [item, snapshotPath(item)]))
}

function runStage(name, command, args) {
  console.log(`\n[verify] ${name} START`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: offlineEnvironment(),
    windowsHide: true,
    shell: process.platform === 'win32' && command === npmCommand,
  })
  const code = result.error ? 1 : result.status ?? 1
  if (result.error) console.error(`[verify] ${name} spawn error: ${result.error.message}`)
  console.log(`[verify] ${name} ${code === 0 ? 'PASS' : `FAIL (${code})`}`)
  return code
}

function offlineEnvironment() {
  const env = { ...process.env, CI: process.env.CI || '1', RW_VERIFY_OFFLINE: '1' }
  for (const key of ['DEEPSEEK_API_KEY', 'FIRECRAWL_API_KEY', 'OPENAI_API_KEY', 'QWEN_API_KEY', 'SEMANTIC_SCHOLAR_API_KEY', 'OPENALEX_API_KEY']) {
    delete env[key]
  }
  return env
}

const before = snapshotWatched()
const stages = [
  ['typecheck', npmCommand, ['run', 'typecheck']],
  ['build', npmCommand, ['run', 'build']],
  ['test', npmCommand, ['test']],
  ['docs', process.execPath, [path.join(root, 'scripts', 'verify-docs.mjs')]],
]
const results = []
let exitCode = 0
for (const [name, command, args] of stages) {
  const code = runStage(name, command, args)
  results.push({ name, code })
  if (code !== 0) {
    exitCode = code
    break
  }
}

const after = snapshotWatched()
const sideEffects = JSON.stringify(before) !== JSON.stringify(after)
if (sideEffects) {
  console.error('[verify] FAIL side-effect guard: watched business data changed during verification')
  exitCode = exitCode || 1
}

console.log(`\n[verify] ${exitCode === 0 ? 'PASS' : 'FAIL'} ${JSON.stringify({ stages: results, sideEffects })}`)
process.exitCode = exitCode
