export const DEFAULT_LEFT = 260
export const DEFAULT_RIGHT = 260
export const MIN_LEFT = 220
export const MAX_LEFT = 340
export const MIN_RIGHT = 220
export const MAX_RIGHT = 360
const STORAGE_KEY = 'rw.layout'

export function clampColWidth(width: number, min: number, max: number): number {
  if (Number.isNaN(width)) return min
  return Math.min(max, Math.max(min, Math.round(width)))
}

export interface ColumnLayout {
  left: number
  right: number
}

export function loadLayout(): ColumnLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT }
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>
    return {
      left: clampColWidth(Number(parsed.left), MIN_LEFT, MAX_LEFT),
      right: clampColWidth(Number(parsed.right), MIN_RIGHT, MAX_RIGHT),
    }
  } catch {
    return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT }
  }
}

export function saveLayout(layout: ColumnLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}
