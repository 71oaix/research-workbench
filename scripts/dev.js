import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const tsxBin = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

// 自动加载 .env.local（Node 22 --env-file；不覆盖已存在的环境变量，如 shell 已 export 则以 export 为准）
const envLocal = path.join(root, '.env.local')
const envArgs = existsSync(envLocal) ? [`--env-file=${envLocal}`] : []

const server = spawn(
  process.execPath,
  [...envArgs, tsxBin, 'watch', 'apps/server/src/index.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT ?? '3000' },
  }
)

const web = spawn(process.execPath, [viteBin], {
  cwd: path.join(root, 'apps', 'web'),
  stdio: 'inherit',
  env: { ...process.env },
})

function shutdown() {
  server.kill()
  web.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
