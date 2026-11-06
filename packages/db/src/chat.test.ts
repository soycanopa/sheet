import { describe, expect, test } from 'vitest'
import { DEFAULT_CHAT_SETTINGS, parseChatSettings } from './chat'

describe('chat settings', () => {
  test('unknown shapes fall back to off — never enabled', () => {
    expect(parseChatSettings(undefined)).toEqual(DEFAULT_CHAT_SETTINGS)
    expect(parseChatSettings(null)).toEqual(DEFAULT_CHAT_SETTINGS)
    expect(parseChatSettings({})).toEqual(DEFAULT_CHAT_SETTINGS)
    expect(parseChatSettings({ enabled: 'yes', provider: 'opencode' })).toEqual(DEFAULT_CHAT_SETTINGS)
  })

  test('keeps an explicit opt-in', () => {
    expect(parseChatSettings({ enabled: true, provider: 'opencode' })).toEqual({ enabled: true, provider: 'opencode' })
  })

  test('an unknown provider keeps the switch but resets the provider', () => {
    expect(parseChatSettings({ enabled: true, provider: 'claude' })).toEqual({ enabled: true, provider: 'opencode' })
  })
})
