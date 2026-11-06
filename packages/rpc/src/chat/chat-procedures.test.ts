import { describe, expect, it } from 'vitest'
import { ensureLocalUser } from '@sheet/db'
import { appRouter } from '../router'

const context = {
  context: { request: new Request('http://localhost/api/rpc') },
}

describe('chat procedures', () => {
  it('reports status while the chat is off', async () => {
    await ensureLocalUser()
    const status = await appRouter.chat.status.callable(context)()
    expect(status.enabled).toBe(false)
    expect(typeof status.cli.found).toBe('boolean')
  })

  it('refuses sessions, prompts, and models while the chat is off', async () => {
    await ensureLocalUser()
    const start = appRouter.chat.start.callable(context)
    const send = appRouter.chat.send.callable(context)
    const models = appRouter.chat.models.callable(context)
    await expect(start({ designId: 'd1' })).rejects.toThrow(/off/)
    await expect(send({ sessionId: 's1', text: 'hi' })).rejects.toThrow(/off/)
    await expect(models()).rejects.toThrow(/off/)
  })

  it('validates send input', async () => {
    await ensureLocalUser()
    const send = appRouter.chat.send.callable(context)
    await expect(send({ sessionId: 's1', text: '' })).rejects.toThrow()
    await expect(send({ sessionId: 's1', text: 'hi', effort: 'turbo' } as never)).rejects.toThrow()
  })
})
