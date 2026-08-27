import type { ReactNode } from 'react'

const base = {
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      {children}
    </svg>
  )
}

export const IconBook = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon>
)
export const IconPlus = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 5v14M5 12h14" /></Icon>
)
export const IconUser = (s: { size?: number } = {}) => (
  <Icon {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Icon>
)
export const IconPlan = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></Icon>
)
export const IconSearch = (s: { size?: number } = {}) => (
  <Icon {...s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>
)
export const IconFilter = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M22 3 9.8 15.2M22 3 15 22l-5.2-6.8M22 3 2 10l6.8 5.2" /></Icon>
)
export const IconPen = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>
)
export const IconScale = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 3v18M5 7l-2 6a3 3 0 0 0 6 0L7 7zM17 7l-2 6a3 3 0 0 0 6 0l-2-6zM3 21h18" /></Icon>
)
export const IconShield = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></Icon>
)
export const IconFile = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Icon>
)
export const IconSpark = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 3l1.8 4.8L18 9.6l-4.2 1.8L12 16l-1.8-4.6L6 9.6l4.2-1.8z" /><path d="M18 15l.9 2.4 2.1.9-2.1.9L18 22l-.9-2.8L15 18.3l2.1-.9z" /></Icon>
)
export const IconCheck = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M20 6 9 17l-5-5" /></Icon>
)
export const IconSpin = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)
export const IconX = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M18 6 6 18M6 6l12 12" /></Icon>
)
export const IconRotate = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></Icon>
)
export const IconXCircle = (s: { size?: number } = {}) => (
  <Icon {...s}><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></Icon>
)
export const IconAlert = (s: { size?: number } = {}) => (
  <Icon {...s}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Icon>
)
