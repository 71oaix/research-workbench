import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDir, '..')
const rootArgIndex = process.argv.indexOf('--root')
const root = path.resolve(rootArgIndex >= 0 ? process.argv[rootArgIndex + 1] ?? defaultRoot : defaultRoot)
const docsRoot = path.join(root, 'docs')
const indexPath = path.join(docsRoot, 'INDEX.md')

const errors = []
const counts = {
  files: 0,
  frontmatterMissing: 0,
  invalidStatus: 0,
  invalidDate: 0,
  orphan: 0,
  ghost: 0,
  mismatch: 0,
  brokenLinks: 0,
  indexAnomalies: 0,
}

function error(kind, message, file) {
  errors.push({ kind, message, file })
}

function walkMarkdown(dir) {
  if (!statSafe(dir)?.isDirectory()) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkMarkdown(absolute))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(absolute)
  }
  return files
}

function statSafe(file) {
  try {
    return statSync(file)
  } catch {
    return null
  }
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) {
    counts.frontmatterMissing += 1
    error('frontmatter-missing', 'missing YAML frontmatter', relative(file))
    return { values: {}, text }
  }
  const values = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!field) continue
    values[field[1]] = field[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  for (const field of ['title', 'status', 'created', 'updated']) {
    if (!values[field]) error('frontmatter-field', `missing ${field}`, relative(file))
  }
  if (values.status && !['active', 'archived'].includes(values.status)) {
    counts.invalidStatus += 1
    error('invalid-status', `status must be active or archived, got ${values.status}`, relative(file))
  }
  for (const field of ['created', 'updated']) {
    if (values[field] && !/^\d{4}-\d{2}-\d{2}$/.test(values[field])) {
      counts.invalidDate += 1
      error('invalid-date', `${field} must use YYYY-MM-DD`, relative(file))
    }
  }
  return { values, text }
}

function resolveIndexPath(value) {
  const normalized = value.replaceAll('\\', '/').replace(/^\//, '')
  return path.resolve(normalized.startsWith('docs/') ? root : docsRoot, normalized.startsWith('docs/') ? normalized : normalized)
}

function normalizeTitle(value) {
  return value
    .replace(/^(Issue|Plan|调研|评测|评审|竞赛材料)[:：]\s*/i, '')
    .replace(/\s*\((?:plan|issue)\)\s*$/i, '')
    .replace(/\s*[（(][^（）()]*[）)]\s*$/u, '')
    .replace(/[\s`/＋+：:·、，,。！？!?_-]/g, '')
    .toLowerCase()
}

function titlesCompatible(indexTitle, frontmatterTitle) {
  const left = normalizeTitle(indexTitle)
  const right = normalizeTitle(frontmatterTitle)
  if (!left || !right || left === right || left.includes(right) || right.includes(left)) return true
  if (left.length < 4 || right.length < 4) return false
  for (let size = Math.min(8, left.length); size >= 4; size -= 1) {
    for (let start = 0; start + size <= left.length; start += 1) {
      if (right.includes(left.slice(start, start + size))) return true
    }
  }
  return false
}

function parseIndex() {
  const entries = []
  const text = readFileSync(indexPath, 'utf8')
  const lines = text.split(/\r?\n/)
  let tableStarted = false
  let headerFound = false
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === '@@') {
      counts.indexAnomalies += 1
      error('index-anomaly', 'literal @@ is not a table row', 'docs/INDEX.md:' + (index + 1))
      return
    }
    if (!tableStarted) {
      if (/^\|\s*文档\s*\|/.test(trimmed)) {
        tableStarted = true
        headerFound = true
      }
      return
    }
    if (!trimmed) return
    if (/^\|\s*:?-{3,}/.test(trimmed)) return
    if (!trimmed.startsWith('|')) {
      counts.indexAnomalies += 1
      error('index-anomaly', 'non-table line after INDEX header', 'docs/INDEX.md:' + (index + 1))
      return
    }
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 3 || !cells[0] || !cells[1] || !cells[2]) {
      counts.indexAnomalies += 1
      error('index-anomaly', 'INDEX row needs title, status and path columns', 'docs/INDEX.md:' + (index + 1))
      return
    }
    entries.push({ title: cells[0], status: cells[1], path: cells[2], line: index + 1 })
  })
  if (!headerFound) {
    counts.indexAnomalies += 1
    error('index-anomaly', 'INDEX table header not found', 'docs/INDEX.md')
  }
  return entries
}

function checkLinks(file, text) {
  const linkPattern = /(?<!!)\[[^\]]+\]\(\s*<?([^)>\s]+)>?(?:\s+[^)]*)?\)/g
  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1]
    if (!rawTarget || rawTarget.startsWith('#') || rawTarget.startsWith('//') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(rawTarget)) continue
    const target = rawTarget.split(/[?#]/, 1)[0]
    if (!target) continue
    const resolved = path.resolve(path.dirname(file), target)
    if (!statSafe(resolved)) {
      counts.brokenLinks += 1
      error('broken-link', `target does not exist: ${rawTarget}`, relative(file))
    }
  }
}

if (!statSafe(indexPath)) {
  error('index-missing', 'docs/INDEX.md does not exist', 'docs/INDEX.md')
} else {
  const markdownFiles = walkMarkdown(docsRoot)
  counts.files = markdownFiles.length
  const docs = new Map()
  for (const file of markdownFiles) {
    const parsed = parseFrontmatter(file)
    docs.set(relative(file), { file, ...parsed })
    checkLinks(file, parsed.text)
  }

  const indexEntries = parseIndex()
  const indexedPaths = new Set()
  for (const entry of indexEntries) {
    const absolute = resolveIndexPath(entry.path)
    const rel = relative(absolute)
    if (indexedPaths.has(rel)) error('index-duplicate', 'duplicate INDEX path', `docs/INDEX.md:${entry.line}`)
    indexedPaths.add(rel)
    if (!statSafe(absolute)) {
      counts.ghost += 1
      error('index-ghost', `INDEX points to missing file: ${entry.path}`, `docs/INDEX.md:${entry.line}`)
      continue
    }
    const doc = docs.get(rel)
    if (!doc) continue
    if (doc.values.title && !titlesCompatible(entry.title, doc.values.title)) {
      counts.mismatch += 1
      error('index-title-mismatch', `INDEX title does not match frontmatter: ${entry.title} != ${doc.values.title}`, `docs/INDEX.md:${entry.line}`)
    }
    if (doc.values.status && doc.values.status !== entry.status) {
      counts.mismatch += 1
      error('index-status-mismatch', `INDEX status does not match frontmatter: ${entry.status} != ${doc.values.status}`, `docs/INDEX.md:${entry.line}`)
    }
  }

  for (const [rel, doc] of docs) {
    if (rel === 'docs/INDEX.md') continue
    if (!indexedPaths.has(rel)) {
      counts.orphan += 1
      error('orphan', 'Markdown file is not listed in INDEX.md', rel)
    }
  }
}

const summary = { ...counts, errors: errors.length }
for (const item of errors) console.error(`[verify-docs] ${item.kind}: ${item.file} ${item.message}`)
console.log(`[verify-docs] ${errors.length === 0 ? 'PASS' : 'FAIL'} ${JSON.stringify(summary)}`)
if (errors.length > 0) process.exitCode = 1
