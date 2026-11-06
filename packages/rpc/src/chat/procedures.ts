import { z } from 'zod'
import { LOCAL_USER_ID, db } from '@sheet/db'
import { userPreferences } from '@sheet/db/schema'
import { eq } from 'drizzle-orm'
import { parseChatSettings } from '@sheet/db/chat'
import { CHAT_EFFORT_LEVELS } from './opencode'
import { chatManager } from './manager'
import { localProcedure } from '../procedures'

/**
 * The `chat` namespace: the internal chat's live OpenCode sessions.
 *
 * Every procedure but `status` refuses when the person left the chat off in
 * Settings › Agents — nothing runs and no agent process spawns while it is
 * off. Turns stream back over the live event stream as `chat.delta` frames,
 * so `send` returns as soon as the turn is accepted.
 */

async function requireChatEnabled(userId: string): Promise<void> {
  const [row] = await db
    .select({
      chatEnabled: userPreferences.chatEnabled,
      chatProvider: userPreferences.chatProvider,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  const settings = parseChatSettings(row ? { enabled: row.chatEnabled, provider: row.chatProvider } : undefined)
  if (!settings.enabled) {
    throw new Error('Internal chat is off. Turn it on in Settings › Agents.')
  }
  if (settings.provider !== 'opencode') {
    throw new Error(`Chat provider ${settings.provider} is not wired yet.`)
  }
}

export const getChatStatus = localProcedure.handler(async () => {
  const [row] = await db
    .select({ chatEnabled: userPreferences.chatEnabled })
    .from(userPreferences)
    .where(eq(userPreferences.userId, LOCAL_USER_ID))
    .limit(1)
  const enabled = row?.chatEnabled ?? false
  const cli = await chatManager.status()
  return { enabled, cli }
})

export const listChatModels = localProcedure.handler(async ({ context }) => {
  await requireChatEnabled(context.user.id)
  return { models: await chatManager.models() }
})

export const startChat = localProcedure
  .input(
    z.object({
      designId: z.string().min(1).max(128),
      model: z.string().min(1).max(160).optional(),
      effort: z
        .string()
        .optional()
        .refine(
          (value) => value === undefined || (CHAT_EFFORT_LEVELS as readonly { value: string }[]).some((level) => level.value === value),
          { message: 'Unknown effort level.' },
        ),
    }),
  )
  .handler(async ({ context, input }) => {
    await requireChatEnabled(context.user.id)
    return chatManager.start(input.designId, { model: input.model, effort: input.effort })
  })

export const sendChat = localProcedure
  .input(
    z.object({
      sessionId: z.string().min(1).max(128),
      text: z.string().min(1).max(20_000),
      model: z.string().min(1).max(160).optional(),
      effort: z
        .string()
        .optional()
        .refine(
          (value) => value === undefined || (CHAT_EFFORT_LEVELS as readonly { value: string }[]).some((level) => level.value === value),
          { message: 'Unknown effort level.' },
        ),
    }),
  )
  .handler(async ({ context, input }) => {
    await requireChatEnabled(context.user.id)
    return chatManager.send(input.sessionId, input.text, { model: input.model, effort: input.effort })
  })

export const cancelChat = localProcedure
  .input(z.object({ sessionId: z.string().min(1).max(128) }))
  .handler(async ({ context, input }) => {
    await requireChatEnabled(context.user.id)
    return chatManager.cancel(input.sessionId)
  })

export const getChatHistory = localProcedure
  .input(z.object({ sessionId: z.string().min(1).max(128) }))
  .handler(async ({ context, input }) => {
    await requireChatEnabled(context.user.id)
    return { transcript: chatManager.history(input.sessionId) }
  })

export const closeChat = localProcedure
  .input(z.object({ sessionId: z.string().min(1).max(128) }))
  .handler(async ({ context, input }) => {
    await requireChatEnabled(context.user.id)
    return chatManager.close(input.sessionId)
  })
