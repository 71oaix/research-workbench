import { useMemo } from 'react'

/**
 * 轻量安全 Markdown 渲染：先转义 HTML，再按白名单标签转换为 HTML。
 * 只支持产物 md 常用子集：标题 / 加粗 / 斜体 / 行内代码 / 代码块 / 列表 / 引用 / 表格 / 段落。
 */
export function MarkdownView({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div
      className="overflow-x-auto leading-relaxed text-ink"
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
  let inList = false
  let inQuote = false
  let inTable = false
  let codeBuffer: string[] | null = null

  function closeList() {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }
  function closeQuote() {
    if (inQuote) {
      html.push('</blockquote>')
      inQuote = false
    }
  }
  function closeTable() {
    if (inTable) {
      html.push('</table>')
      inTable = false
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const start = i

    // fenced code block
    if (line.trimStart().startsWith('```')) {
      closeList(); closeQuote(); closeTable()
      codeBuffer = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeBuffer.push(lines[i])
        i++
      }
      i++ // skip closing ```
      html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeList(); closeQuote(); closeTable()
      const level = Math.min(heading[1].length, 4)
      html.push(`<h${level} class="mt-3 mb-1 font-semibold text-ink">${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (line.trimStart().startsWith('|')) {
      closeList(); closeQuote(); closeTable()
      const block: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        block.push(lines[i])
        i++
      }
      let header = block[0] ?? ''
      let body = block.slice(1)
      if (body.length > 0 && /^\|[\s:-|]+\|\s*$/.test(body[0].trim())) {
        body = body.slice(1)
      }
      const headCells = splitTable(header).map((cell) => `<th>${inline(cell)}</th>`).join('')
      html.push(`<table class="my-2 min-w-[560px] border-collapse text-[12.5px]"><thead><tr>${headCells}</tr></thead><tbody>`)
      for (const row of body) {
        const cells = splitTable(row).map((cell) => `<td>${inline(cell)}</td>`).join('')
        html.push(`<tr>${cells}</tr>`)
      }
      html.push('</tbody></table>')
      continue
    }

    const list = line.match(/^\s*[-*]\s+(.*)$/)
    if (list) {
      closeQuote(); closeTable()
      if (!inList) {
        html.push('<ul class="my-1 list-disc pl-5">')
        inList = true
      }
      html.push(`<li class="mb-0.5">${inline(list[1])}</li>`)
      i++
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeList(); closeTable()
      if (!inQuote) {
        html.push('<blockquote class="my-2 border-l-2 border-accent-line pl-3 text-ink2">')
        inQuote = true
      }
      html.push(`<p>${inline(quote[1])}</p>`)
      i++
      continue
    }

    closeList(); closeQuote(); closeTable()
    if (line.trim() === '') {
      i++
      continue
    }
    if (start === i) {
      html.push(`<p class="my-1">${inline(line)}</p>`)
      i++
    }
  }

  closeList(); closeQuote(); closeTable()
  return html.join('\n')
}

function splitTable(line: string): string[] {
  return line.split('|').map((cell) => cell.trim())
}
