import type { ReactNode } from 'react'

interface PaperCard {
  id: number
  title: string
  level: string | null
  abstract: string
  doi: string
  year: string
  citations: string
  reason: string
}

const LEVEL_TAG: Record<string, string> = {
  高: 'bg-ok-soft text-ok',
  部分: 'bg-warn-soft text-warn',
}

export function PaperCards({ content }: { content: string }) {
  const cards = parseCards(content)
  if (cards.length === 0) return <MarkdownFallback content={content} />
  return (
    <div className="space-y-2.5">
      {cards.map((card) => (
        <div
          key={card.id}
          className="rounded-(--radius) border border-line-soft bg-surface p-3 shadow-(--shadow-soft)"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-none rounded-md bg-surface2 px-1.5 py-0.5 font-mono text-[11px] text-ink2">
              [{card.id}]
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-[1.45] text-ink">{card.title}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink3">
                {card.year && <span>{card.year}</span>}
                {card.citations && <span>引用 {card.citations}</span>}
                {card.doi && <span className="truncate">{card.doi}</span>}
              </div>
              {card.abstract && (
                <p className="mt-2 text-[12px] leading-relaxed text-ink2">{card.abstract}</p>
              )}
              {card.reason && (
                <p className="mt-2 border-t border-line-soft pt-2 text-[11.5px] text-ink2">
                  <span className="font-semibold text-ink">筛选理由：</span>
                  {card.reason}
                </p>
              )}
            </div>
            {card.level && (
              <span
                className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  LEVEL_TAG[card.level] ?? 'bg-surface2 text-ink2'
                }`}
              >
                {card.level}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function MarkdownFallback({ content }: { content: string }): ReactNode {
  // 候选池等无卡片结构时退回纯文本
  return <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] text-ink">{content}</pre>
}

function parseCards(content: string): PaperCard[] {
  const cards: PaperCard[] = []
  const blocks = content.split(/###\s*\[(\d+)\]\s+/)
  for (let i = 1; i < blocks.length; i += 2) {
    const id = Number(blocks[i])
    const body = blocks[i + 1] ?? ''
    const lines = body.split('\n')
    const title = lines[0]?.replace(/^#+\s*/, '').trim() ?? ''
    const text = lines.slice(1).join('\n')
    const levelMatch = text.match(/相关度[：:]\s*(高|部分)/)
    const abstract = match(text, /摘要[：:]\s*(.+)/) ?? ''
    const doi = match(text, /DOI[：:]\s*([^\s|]+)/) ?? ''
    const year = match(text, /年份[：:]\s*(\d{4})/) ?? ''
    const citations = match(text, /引用数[：:]\s*(\d+)/) ?? ''
    const reason = match(text, /筛选理由[：:]\s*(.+)/) ?? ''
    cards.push({
      id,
      title,
      level: levelMatch ? levelMatch[1] : null,
      abstract,
      doi,
      year,
      citations,
      reason,
    })
  }
  return cards
}

function match(text: string, re: RegExp): string | null {
  return text.match(re)?.[1]?.trim() ?? null
}
