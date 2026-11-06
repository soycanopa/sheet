import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest'

const get = vi.fn(async () => ({ shortcuts: null, chat: { enabled: false, provider: 'opencode' } }))
const save = vi.fn()

vi.doMock('@sheet/rpc/client', () => ({
  orpc: { preferences: { get, save } },
}))

const { SettingsWindow } = await import('./settings-window')

describe('SettingsWindow sections', () => {
  beforeEach(() => {
    get.mockClear()
    save.mockClear()
  })

  afterEach(() => cleanup())

  test('Agents holds the internal chat, MCP holds the external setup', async () => {
    render(<SettingsWindow />)

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }))
    expect(await screen.findByRole('switch', { name: 'Duma' })).toBeTruthy()
    expect(screen.getByText('Providers')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    expect(await screen.findByRole('tablist', { name: 'Agent' })).toBeTruthy()
  })
})
