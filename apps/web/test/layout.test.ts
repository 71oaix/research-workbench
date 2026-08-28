import { afterEach, describe, expect, it } from 'vitest'
import {
  clampColWidth,
  DEFAULT_LEFT,
  DEFAULT_RIGHT,
  loadLayout,
  MAX_LEFT,
  MAX_RIGHT,
  MIN_LEFT,
  MIN_RIGHT,
  saveLayout,
} from '../src/lib/layout'

afterEach(() => {
  localStorage.removeItem('rw.layout')
})

describe('clampColWidth', () => {
  it('clamps to the given range and rounds', () => {
    expect(clampColWidth(100, MIN_LEFT, MAX_LEFT)).toBe(220)
    expect(clampColWidth(9999, MIN_LEFT, MAX_LEFT)).toBe(340)
    expect(clampColWidth(260.4, MIN_LEFT, MAX_LEFT)).toBe(260)
    expect(clampColWidth(260.6, MIN_LEFT, MAX_LEFT)).toBe(261)
    expect(clampColWidth(Number.NaN, MIN_LEFT, MAX_LEFT)).toBe(220)
    expect(clampColWidth(300, MIN_RIGHT, MAX_RIGHT)).toBe(300)
    expect(MAX_RIGHT).toBeGreaterThan(MAX_LEFT)
  })
})

describe('loadLayout / saveLayout', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadLayout()).toEqual({ left: DEFAULT_LEFT, right: DEFAULT_RIGHT })
  })

  it('roundtrips a saved layout', () => {
    saveLayout({ left: 300, right: 320 })
    expect(loadLayout()).toEqual({ left: 300, right: 320 })
  })

  it('falls back on corrupt json and out-of-range values', () => {
    localStorage.setItem('rw.layout', '{broken')
    expect(loadLayout()).toEqual({ left: DEFAULT_LEFT, right: DEFAULT_RIGHT })
    localStorage.setItem('rw.layout', JSON.stringify({ left: 50, right: 'wide' }))
    const layout = loadLayout()
    expect(layout.left).toBe(220)
    expect(layout.right).toBe(220)
  })
})
