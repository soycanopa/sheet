import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'

const status = vi.fn(async () => ({ enabled: true, cli: { found: true, version: '2.2.5', sessions: 0 } }))
const start = vi.fn(async () => ({
  id: 'chat-1',
  designId: 'design-1',
  model: null,
  effort: 'auto',
  models: [],
  efforts: [{ value: 'auto', label: 'Auto' }],
  busy: false,
  transcript: [],
}))
const history = vi.fn(async () => ({ transcript: [] }))

vi.doMock('@sheet/rpc/client', () => ({
  orpc: {
    preferences: { get: vi.fn(), save: vi.fn() },
    chat: { status, start, history, send: vi.fn(), cancel: vi.fn() },
  },
}))

const { ChatFloating } = await import('./chat-floating')

describe('ChatFloating', () => {
  beforeEach(() => {
    status.mockClear()
    start.mockClear()
  })

  afterEach(() => cleanup())

  test('floats the same thread with a close control', async () => {
    const onClose = vi.fn()
    render(<ChatFloating designId="design-1" onClose={onClose} />)
    expect(await screen.findByRole('combobox', { name: 'Effort' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
    expect(onClose).toHaveBeenCalled()
  })
})
