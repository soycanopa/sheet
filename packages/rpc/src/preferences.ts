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
  side: z.enum(['left', 'right']),
  mode: z.enum(['panel', 'floating']),
})

type ChatRow = { chatEnabled: boolean; chatProvider: unknown; chatSide: unknown; chatMode: unknown } | undefined

function toChatSettings(row: ChatRow): ChatSettings {
  if (!row) return { ...DEFAULT_CHAT_SETTINGS }
  return parseChatSettings({ enabled: row.chatEnabled, provider: row.chatProvider, side: row.chatSide, mode: row.chatMode })
}

async function readChatRow(userId: string) {
  const [row] = await db
    .select({
      shortcuts: userPreferences.shortcuts,
      chatEnabled: userPreferences.chatEnabled,
      chatProvider: userPreferences.chatProvider,
      chatSide: userPreferences.chatSide,
      chatMode: userPreferences.chatMode,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  return row
}

export const getPreferences = localProcedure.handler(async ({ context }) => {
  const row = await readChatRow(context.user.id)
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
    const row = await readChatRow(context.user.id)
    const shortcuts = input.shortcuts !== undefined ? parseShortcutConfig(input.shortcuts) : row ? parseShortcutConfig(row.shortcuts) : EMPTY_SHORTCUT_CONFIG
    const chat = input.chat !== undefined ? parseChatSettings(input.chat) : toChatSettings(row)
    await db
      .insert(userPreferences)
      .values({
        userId: context.user.id,
        shortcuts,
        chatEnabled: chat.enabled,
        chatProvider: chat.provider,
        chatSide: chat.side,
        chatMode: chat.mode,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          shortcuts,
          chatEnabled: chat.enabled,
          chatProvider: chat.provider,
          chatSide: chat.side,
          chatMode: chat.mode,
          updatedAt: new Date(),
        },
      })
    return { shortcuts, chat }
  })
