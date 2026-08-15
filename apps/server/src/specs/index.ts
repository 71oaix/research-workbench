import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const fragmentsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fragments')

export function loadSpec(name: string): string {
  return readFileSync(path.join(fragmentsDir, `${name}.md`), 'utf8')
}

export function buildSearchSpecPrompt(): string {
  return [
    '',
    '## 检索规范（程序内化）',
    loadSpec('source-tiers'),
    loadSpec('query-construction'),
    loadSpec('dedup'),
  ].join('\n\n')
}

export function buildWritingSpecPrompt(): string {
  return ['', '## 写作规范（程序内化）', loadSpec('writing')].join('\n\n')
}
