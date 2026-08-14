import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ status: 'ok', db: 'ok' }),
      })
    )
  )
})

describe('App placeholder', () => {
  it('renders title and backend status', async () => {
    render(<App />)
    expect(screen.getAllByText(/研镜/).length).toBeGreaterThan(0)
    expect(await screen.findByText(/后端状态/)).toBeTruthy()
    expect(screen.getByText(/● ok/)).toBeTruthy()
  })
})
