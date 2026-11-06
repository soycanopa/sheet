import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'

const get = vi.fn(async () => ({ chat: { enabled: false, provider: 'opencode', side: 'left', mode: 'panel' } }))
const save = vi.fn(
  async (input: { chat: { enabled: boolean; provider: 'opencode'; side: 'left' | 'right'; mode: 'panel' | 'floating' } }) => ({
    chat: input.chat,
  }),
)

vi.doMock('@sheet/rpc/client', () => ({
  orpc: { preferences: { get, save } },
}))

const { InternalChatSettings } = await import('./chat-settings')

describe('InternalChatSettings', () => {
  beforeEach(() => {
    get.mockClear()
    save.mockClear()
    get.mockResolvedValue({ chat: { enabled: false, provider: 'opencode', side: 'left', mode: 'panel' } })
    save.mockImplementation(
      async (input: { chat: { enabled: boolean; provider: 'opencode'; side: 'left' | 'right'; mode: 'panel' | 'floating' } }) => ({
        chat: input.chat,
      }),
    )
  })

  afterEach(() => cleanup())

  test('loads off and saves the flip', async () => {
    render(<InternalChatSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Internal chat' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ chat: { enabled: true, provider: 'opencode', side: 'left', mode: 'panel' } }),
    )
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  test('saves the panel side and floating mode', async () => {
    render(<InternalChatSettings />)
    await screen.findByRole('switch', { name: 'Internal chat' })
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ chat: { enabled: false, provider: 'opencode', side: 'right', mode: 'panel' } }),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Floating' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ chat: { enabled: false, provider: 'opencode', side: 'right', mode: 'floating' } }),
    )
  })

  test('lists OpenCode as the provider', async () => {
    render(<InternalChatSettings />)
    expect(await screen.findByText('Providers')).toBeTruthy()
    expect(screen.getByText('OpenCode')).toBeTruthy()
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
