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
const history = vi.fn(
  async (): Promise<{ transcript: { role: string; text: string; turn: number }[] }> => ({
    transcript: [{ role: 'user', text: 'Hello Duma', turn: 0 }],
  }),
)
const list = vi.fn(async () => ({ sessions: [] }))
const get = vi.fn(async (input: { sessionId: string }) => ({
  id: input.sessionId,
  designId: 'design-1',
  model: null,
  effort: 'auto',
  models: [],
  efforts: [{ value: 'auto', label: 'Auto' }],
  busy: false,
  transcript: [],
}))
const close = vi.fn(async () => ({ closed: true }))

vi.doMock('@sheet/rpc/client', () => ({
  orpc: {
    preferences: { get: vi.fn(), save: vi.fn() },
    chat: { status, start, history, send: vi.fn(), cancel: vi.fn(), list, get, close },
  },
}))

const { ChatFloating, chatTimeAgo } = await import('./chat-floating')

describe('ChatFloating', () => {
  beforeEach(() => {
    status.mockClear()
    start.mockClear()
    list.mockClear()
    get.mockClear()
    list.mockResolvedValue({ sessions: [] })
  })

  afterEach(() => cleanup())

  test('collapses to a pill that reopens the window', async () => {
    const onOpenChange = vi.fn()
    render(<ChatFloating designId="design-1" open={false} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Duma' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  test('opens with a session rail beside the thread', async () => {
    render(<ChatFloating designId="design-1" open={true} onOpenChange={() => undefined} />)
    expect(await screen.findByText('Chats')).toBeTruthy()
    // First open starts one chat and selects it in the rail.
    const selected = await screen.findByRole('button', { current: true })
    expect(selected.textContent).toContain('New chat')
    expect(get).toHaveBeenCalledWith({ sessionId: 'chat-1' })
    expect(await screen.findByText('Hello Duma')).toBeTruthy()
  })

  test('collapses from the header control', async () => {
    const onOpenChange = vi.fn()
    render(<ChatFloating designId="design-1" open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse chat' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('stamps the rail in short relative time', () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    expect(chatTimeAgo(now - 30_000, now)).toBe('just now')
    expect(chatTimeAgo(now - 5 * 60_000, now)).toBe('5m ago')
    expect(chatTimeAgo(now - 5 * 3_600_000, now)).toBe('5h ago')
    expect(chatTimeAgo(now - 3 * 86_400_000, now)).toBe('3d ago')
  })
})
