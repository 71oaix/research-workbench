export const STATUS_LABEL: Record<string, string> = {
  planning: '待启动',
  executing: '运行中',
  paused: '待审批',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
}

export const STATUS_PILL: Record<string, string> = {
  planning: 'bg-surface2 text-ink2',
  executing: 'bg-run-soft text-run',
  paused: 'bg-warn-soft text-warn',
  completed: 'bg-ok-soft text-ok',
  cancelled: 'bg-surface2 text-ink2',
  failed: 'bg-bad-soft text-bad',
}

export const STATUS_META: Record<string, { label: string; dot: string }> = {
  planning: { label: '待启动', dot: 'bg-accent' },
  executing: { label: '运行中', dot: 'bg-run' },
  paused: { label: '待审批', dot: 'bg-warn' },
  completed: { label: '已完成', dot: 'bg-ok' },
  cancelled: { label: '已取消', dot: 'bg-ink3' },
  failed: { label: '失败', dot: 'bg-bad' },
}

export const STATUS_DOT_FALLBACK = 'bg-ink3'

export const WS_STATUS_META: Record<string, { label: string; dot: string }> = {
  open: { label: '已连接', dot: 'bg-ok' },
  connecting: { label: '连接中', dot: 'bg-run animate-pulse' },
  closed: { label: '连接断开，自动重连中', dot: 'bg-bad' },
}

export const DECISION_LABEL: Record<string, string> = {
  approve: '已通过',
  modify: '打回修改',
  reject: '已取消',
  retry: '已重试',
}

export function relativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Date.now() - time
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 2 * DAY) return '昨天'
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  const d = new Date(time)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
