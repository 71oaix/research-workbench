import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const tsxBin = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const server = spawn(
  process.execPath,
  [tsxBin, 'watch', 'apps/server/src/index.ts'],
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
