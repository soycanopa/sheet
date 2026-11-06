import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'

const status = vi.fn(async () => ({ enabled: false, cli: { found: true, version: '2.2.5', sessions: 0 } }))
const start = vi.fn()
const history = vi.fn(async () => ({ transcript: [] }))
const send = vi.fn(async () => ({ accepted: true }))
const cancel = vi.fn(async () => ({ cancelled: true }))

vi.doMock('@sheet/rpc/client', () => ({
  orpc: {
    preferences: { get: vi.fn(), save: vi.fn() },
    chat: { status, start, history, send, cancel },
  },
}))

const { ChatPanel } = await import('./chat-panel')

const VIEW = {
  id: 'chat-1',
  designId: 'design-1',
  model: 'xai/grok-4.7',
  effort: 'high',
  models: [
    { value: 'xai/grok-4.7', name: 'Grok 4.7', source: 'xAI' },
    { value: 'deepseek/deepseek-flash', name: 'DeepSeek V4.1 Flash 1017', source: 'DeepSeek' },
  ],
  efforts: [
    { value: 'auto', label: 'Auto' },
    { value: 'high', label: 'High' },
  ],
  busy: false,
  transcript: [],
}

describe('ChatPanel', () => {
  beforeEach(() => {
    status.mockClear()
    start.mockClear()
    send.mockClear()
    status.mockResolvedValue({ enabled: false, cli: { found: true, version: '2.2.5', sessions: 0 } })
    start.mockResolvedValue(VIEW)
    history.mockResolvedValue({ transcript: [] })
  })

  afterEach(() => cleanup())

  test('points at Settings while Duma is off', async () => {
    render(<ChatPanel designId="design-1" />)
    expect(await screen.findByText('Duma is off')).toBeTruthy()
    expect(screen.getByText(/Settings › Agents/)).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })

  test('shows the composer with model and effort pills once on', async () => {
    status.mockResolvedValue({ enabled: true, cli: { found: true, version: '2.2.5', sessions: 0 } })
    render(<ChatPanel designId="design-2" />)
    expect(await screen.findByRole('button', { name: 'Model' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Effort' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy()
    expect(start).toHaveBeenCalledWith({ designId: 'design-2', model: undefined, effort: undefined })
  })

  test('sends the composer text to the session', async () => {
    status.mockResolvedValue({ enabled: true, cli: { found: true, version: '2.2.5', sessions: 0 } })
    render(<ChatPanel designId="design-3" />)
    await screen.findByRole('button', { name: 'Model' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'What is here?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(send).toHaveBeenCalledWith({
      sessionId: 'chat-1',
      text: 'What is here?',
      model: 'xai/grok-4.7',
      effort: 'high',
    })
  })
})
