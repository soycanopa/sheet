import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'

const get = vi.fn(async () => ({ chat: { enabled: false, provider: 'opencode' } }))
const save = vi.fn(async (input: { chat: { enabled: boolean; provider: 'opencode' } }) => ({ chat: input.chat }))

vi.doMock('@sheet/rpc/client', () => ({
  orpc: { preferences: { get, save } },
}))

const { InternalChatSettings } = await import('./chat-settings')

describe('InternalChatSettings', () => {
  beforeEach(() => {
    get.mockClear()
    save.mockClear()
    get.mockResolvedValue({ chat: { enabled: false, provider: 'opencode' } })
    save.mockImplementation(async (input: { chat: { enabled: boolean; provider: 'opencode' } }) => ({ chat: input.chat }))
  })

  afterEach(() => cleanup())

  test('loads off and saves the flip', async () => {
    render(<InternalChatSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Internal chat' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    await waitFor(() => expect(save).toHaveBeenCalledWith({ chat: { enabled: true, provider: 'opencode' } }))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  test('reverts and warns when saving fails', async () => {
    save.mockRejectedValueOnce(new Error('down'))
    render(<InternalChatSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Internal chat' })

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
