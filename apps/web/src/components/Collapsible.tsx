import { type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { IconChevron } from './icons'

export function Collapsible({
  open,
  onToggle,
  header,
  summary,
  children,
  bodyClassName = 'p-4',
  flush = false,
}: {
  open: boolean
  onToggle: () => void
  header: ReactNode
  summary?: ReactNode
  children: ReactNode
  bodyClassName?: string
  flush?: boolean
}) {
  return (
    <div
      className={cn(
        !flush &&
          'rounded-(--radius-lg) border border-line-soft bg-surface shadow-(--shadow-soft) shadow-[inset_0_1px_0_rgba(255,255,255,.72)]'
      )}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 text-left transition-colors hover:bg-surface2/60',
          flush ? 'px-3.5 py-2' : 'px-3.5 py-2.5'
        )}
      >
        <IconChevron
          size={14}
          className={cn('flex-none text-ink3 transition-transform duration-300', open && 'rotate-90')}
        />
        <span className="min-w-0 flex-1 truncate">{header}</span>
        {!open && summary != null && (
          <span className="flex-none text-[11.5px] text-ink3">{summary}</span>
        )}
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className={bodyClassName}>{children}</div>
        </div>
      </div>
    </div>
  )
}
