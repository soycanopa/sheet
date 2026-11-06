import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@sheet/db'
import { DEFAULT_CHAT_SETTINGS, parseChatSettings, type ChatSettings } from '@sheet/db/chat'
import { userPreferences } from '@sheet/db/schema'
import { EMPTY_SHORTCUT_CONFIG } from '@sheet/db/shortcuts'
import { parseShortcutConfig, shortcutConfigSchema } from './shortcuts'
import { localProcedure } from './procedures'

/**
 * The `preferences` namespace: per-account editor settings.
 */

const chatSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal('opencode'),
})

function toChatSettings(row: { chatEnabled: boolean; chatProvider: unknown } | undefined): ChatSettings {
  if (!row) return { ...DEFAULT_CHAT_SETTINGS }
  return parseChatSettings({ enabled: row.chatEnabled, provider: row.chatProvider })
}

export const getPreferences = localProcedure.handler(async ({ context }) => {
  const [row] = await db
    .select({
      shortcuts: userPreferences.shortcuts,
      chatEnabled: userPreferences.chatEnabled,
      chatProvider: userPreferences.chatProvider,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.user.id))
    .limit(1)
  return {
    shortcuts: row ? parseShortcutConfig(row.shortcuts) : EMPTY_SHORTCUT_CONFIG,
    chat: toChatSettings(row),
  }
})

export const savePreferences = localProcedure
  .input(
    z.object({
      shortcuts: shortcutConfigSchema.optional(),
      chat: chatSettingsSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select({
        shortcuts: userPreferences.shortcuts,
        chatEnabled: userPreferences.chatEnabled,
        chatProvider: userPreferences.chatProvider,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, context.user.id))
      .limit(1)
    const shortcuts = input.shortcuts !== undefined ? parseShortcutConfig(input.shortcuts) : row ? parseShortcutConfig(row.shortcuts) : EMPTY_SHORTCUT_CONFIG
    const chat = input.chat !== undefined ? parseChatSettings(input.chat) : toChatSettings(row)
    await db
      .insert(userPreferences)
      .values({
        userId: context.user.id,
        shortcuts,
        chatEnabled: chat.enabled,
        chatProvider: chat.provider,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          shortcuts,
          chatEnabled: chat.enabled,
          chatProvider: chat.provider,
          updatedAt: new Date(),
        },
      })
    return { shortcuts, chat }
  })
