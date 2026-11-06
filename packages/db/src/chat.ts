/**
 * The internal chat's settings: whether it may run at all, and through
 * which provider. Only OpenCode is wired today; the provider stays in the
 * model so the window can name what answers without a fake picker.
 */

export const CHAT_PROVIDERS = ['opencode'] as const

export type ChatProvider = (typeof CHAT_PROVIDERS)[number]

export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'opencode'

export interface ChatSettings {
  enabled: boolean
  provider: ChatProvider
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enabled: false,
  provider: DEFAULT_CHAT_PROVIDER,
}

function isChatProvider(input: unknown): input is ChatProvider {
  return typeof input === 'string' && (CHAT_PROVIDERS as readonly string[]).includes(input)
}

/** Unknown, partial, or legacy shapes fall back to off — never enabled. */
export function parseChatSettings(input: unknown): ChatSettings {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_CHAT_SETTINGS }
  const settings = input as Partial<ChatSettings>
  return {
    enabled: settings.enabled === true,
    provider: isChatProvider(settings.provider) ? settings.provider : DEFAULT_CHAT_PROVIDER,
  }
}
