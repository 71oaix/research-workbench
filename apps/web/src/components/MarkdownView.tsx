import { useMemo } from 'react'
import type { CiteMeta } from '../lib/citations'

/**
 * 轻量安全 Markdown 渲染：先转义 HTML，再按白名单标签转换为 HTML。
 * 只支持产物 md 常用子集：标题 / 加粗 / 斜体 / 行内代码 / 代码块 / 有序无序列表 / 引用 / 表格 / 分隔线 / 段落。
 * 视觉样式统一收敛在 index.css 的 .md-body 作用域。
 * citations 传入时（仅 writer 草稿），正文 [n] 渲染为可交互引用上标。
 */
export function MarkdownView({
  content,
  doc = false,
  citations,
  onCiteClick,
}: {
  content: string
  doc?: boolean
  citations?: Map<number, CiteMeta>
  onCiteClick?: (id: number) => void
}) {
  const baseHtml = useMemo(() => renderMarkdown(content), [content])
  const html = useMemo(
    () => (citations ? applyCitations(baseHtml, citations) : baseHtml),
    [baseHtml, citations]
  )
  return (
    <div
      className={doc ? 'md-body md-doc' : 'md-body'}
      onClick={
        onCiteClick
          ? (event) => {
              const target = (event.target as HTMLElement).closest('.cite-mark')
              if (!target) return
              const id = Number(target.getAttribute('data-cite'))
              if (!Number.isNaN(id)) onCiteClick(id)
            }
          : undefined
      }
      onKeyDown={
        onCiteClick
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              const target = (event.target as HTMLElement).closest('.cite-mark')
              if (!target) return
              const id = Number(target.getAttribute('data-cite'))
              if (!Number.isNaN(id)) {
                event.preventDefault()
                onCiteClick(id)
              }
            }
          : undefined
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderMarkdown(source: string): string {
  const lines = source.split('\n')
  const html: string[] = []
  let i = 0
  let inList: 'ul' | 'ol' | null = null
  let inQuote = false

  function closeList() {
    if (inList) {
      html.push(`</${inList}>`)
      inList = null
    }
  }
  function closeQuote() {
    if (inQuote) {
      html.push('</blockquote>')
      inQuote = false
    }
  }
  function closeBlocks() {
    closeList()
    closeQuote()
  }

  while (i < lines.length) {
    const line = lines[i]

    // fenced code block
    if (line.trimStart().startsWith('```')) {
      closeBlocks()
      const codeBuffer: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeBuffer.push(lines[i])
        i++
      }
      i++ // skip closing ```
      html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
      continue
    }

    // thematic break (--- *** ___)
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeBlocks()
      html.push('<hr/>')
      i++
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeBlocks()
      const level = Math.min(heading[1].length, 4)
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (line.trimStart().startsWith('|')) {
      closeBlocks()
      const block: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        block.push(lines[i])
        i++
      }
      let header = block[0] ?? ''
      let body = block.slice(1)
      if (body.length > 0 && /^\|[\s:|-]+\|\s*$/.test(body[0].trim())) {
        body = body.slice(1)
      }
      const headCells = splitTable(header).map((cell) => `<th>${inline(cell)}</th>`).join('')
      html.push('<div class="md-table-wrap"><table><thead><tr>' + headCells + '</tr></thead><tbody>')
      for (const row of body) {
        const cells = splitTable(row).map((cell) => `<td>${inline(cell)}</td>`).join('')
        html.push(`<tr>${cells}</tr>`)
      }
      html.push('</tbody></table></div>')
      continue
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (ordered) {
      closeQuote()
      if (inList && inList !== 'ol') closeList()
      if (!inList) {
        html.push('<ol>')
        inList = 'ol'
      }
      html.push(`<li>${inline(ordered[2])}</li>`)
      i++
      continue
    }

    const list = line.match(/^\s*[-*]\s+(.*)$/)
    if (list) {
      closeQuote()
      if (inList && inList !== 'ul') closeList()
      if (!inList) {
        html.push('<ul>')
        inList = 'ul'
      }
      html.push(`<li>${inline(list[1])}</li>`)
      i++
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeList()
      if (!inQuote) {
        html.push('<blockquote>')
        inQuote = true
      }
      html.push(`<p>${inline(quote[1])}</p>`)
      i++
      continue
    }

    closeBlocks()
    if (line.trim() === '') {
      i++
      continue
    }
    html.push(`<p>${inline(line)}</p>`)
    i++
  }

  closeBlocks()
  return html.join('\n')
}

function splitTable(line: string): string[] {
  const cells = line.split('|').map((cell) => cell.trim())
  if (cells[0] === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

// ---------- 引用上标（仅 writer 草稿启用） ----------

function applyCitations(html: string, citations: Map<number, CiteMeta>): string {
  const codePattern = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g
  return html
    .split(codePattern)
    .map((segment) =>
      segment.startsWith('<pre') || segment.startsWith('<code')
        ? segment
        : segment.replace(/\[(\d{1,4})\]/g, (raw, num: string) => citeSup(Number(num), citations))
    )
    .join('')
}

function citeSup(id: number, citations: Map<number, CiteMeta>): string {
  const meta = citations.get(id)
  const status = meta?.status ?? 'unknown'
  const tipParts: string[] = []
  if (meta?.title) tipParts.push(escapeHtml(meta.title))
  if (meta?.year) tipParts.push(escapeHtml(meta.year))
  tipParts.push(CITE_TIP_STATUS[status])
  if (meta?.confidence) tipParts.push(`置信 ${escapeHtml(meta.confidence)}`)
  return (
    `<sup class="cite-mark" data-cite="${id}" data-status="${status}"` +
    (status === 'unknown' ? '' : ' role="button" tabindex="0"') +
    `><span class="cite-tip">${tipParts.join(' · ')}</span>[${id}]</sup>`
  )
}

const CITE_TIP_STATUS: Record<CiteMeta['status'], string> = {
  verified: '核验通过',
  warn: '建议复核',
  bad: '待修正',
  unknown: '未在核验清单中',
}
