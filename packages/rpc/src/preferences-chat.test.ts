import { describe, expect, it } from 'vitest'
import { ensureLocalUser } from '@sheet/db'
import { EMPTY_SHORTCUT_CONFIG } from '@sheet/db/shortcuts'
import { appRouter } from './router'

const context = {
  context: { request: new Request('http://localhost/api/rpc') },
}

describe('chat preferences', () => {
  it('defaults to off, saves an opt-in, and keeps it across a shortcuts save', async () => {
    await ensureLocalUser()
    const get = appRouter.preferences.get.callable(context)
    const save = appRouter.preferences.save.callable(context)

    expect((await get()).chat).toEqual({ enabled: false, provider: 'opencode' })

    const saved = await save({ chat: { enabled: true, provider: 'opencode' } })
    expect(saved.chat).toEqual({ enabled: true, provider: 'opencode' })
    expect((await get()).chat).toEqual({ enabled: true, provider: 'opencode' })

    await save({ shortcuts: EMPTY_SHORTCUT_CONFIG })
    expect((await get()).chat).toEqual({ enabled: true, provider: 'opencode' })

    await save({ chat: { enabled: false, provider: 'opencode' } })
    expect((await get()).chat).toEqual({ enabled: false, provider: 'opencode' })
  })

  it('rejects an unknown provider', async () => {
    await ensureLocalUser()
    const save = appRouter.preferences.save.callable(context)
    await expect(save({ chat: { enabled: true, provider: 'other' } } as never)).rejects.toThrow()
  })
})
