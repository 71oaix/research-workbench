import { afterEach, describe, expect, it, vi } from 'vitest'
import { DECISION_LABEL, relativeTime, STATUS_LABEL, WS_STATUS_META } from '../src/lib/labels'

afterEach(() => {
  vi.useRealTimers()
})

describe('relativeTime', () => {
  it('buckets by recency and falls back to date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-28T20:00:00'))
    expect(relativeTime('2026-08-28T19:59:40')).toBe('刚刚')
    expect(relativeTime('2026-08-28T19:35:00')).toBe('25 分钟前')
    expect(relativeTime('2026-08-28T15:00:00')).toBe('5 小时前')
    expect(relativeTime('2026-08-27T20:00:00')).toBe('昨天')
    expect(relativeTime('2026-08-24T20:00:00')).toBe('4 天前')
    expect(relativeTime('2026-08-10T20:00:00')).toBe('2026-08-10')
    expect(relativeTime('not-a-date')).toBe('')
  })
})

describe('label maps', () => {
  it('covers every workflow status', () => {
    for (const status of ['planning', 'executing', 'paused', 'completed', 'cancelled', 'failed']) {
      expect(STATUS_LABEL[status]).toBeTruthy()
      expect(WS_STATUS_META[status]).toBeUndefined()
    }
    for (const state of ['open', 'connecting', 'closed']) {
      expect(WS_STATUS_META[state].label).toBeTruthy()
      expect(WS_STATUS_META[state].dot).toBeTruthy()
    }
  })

  it('covers every decision type including retry', () => {
    for (const type of ['approve', 'modify', 'reject', 'retry']) {
      expect(DECISION_LABEL[type]).toBeTruthy()
    }
    expect(DECISION_LABEL.modify).toBe('打回修改')
  })
})
