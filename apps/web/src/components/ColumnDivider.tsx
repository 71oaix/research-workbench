import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '../lib/cn'

export function ColumnDivider({
  ariaLabel,
  onResize,
  onReset,
  className,
}: {
  ariaLabel: string
  onResize: (delta: number) => void
  onReset: () => void
  className?: string
}) {
  const startX = useRef<number | null>(null)

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    startX.current = event.clientX
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* jsdom 等环境无活动指针，忽略 */
    }
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (startX.current === null) return
    onResize(event.clientX - startX.current)
    startX.current = event.clientX
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    startX.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* 同上 */
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      title="拖拽调整宽度 · 双击重置"
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onResize(-16)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          onResize(16)
        }
      }}
      className={cn(
        'group relative w-1.5 flex-none cursor-col-resize touch-none select-none outline-none focus-visible:bg-accent-soft',
        className
      )}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent" />
    </div>
  )
}
