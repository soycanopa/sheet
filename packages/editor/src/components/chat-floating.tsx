import { useEffect, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import { BotIcon, ChevronDownIcon, PlusIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { ChatPanel } from './chat-panel'

export interface FloatSession {
  id: string
  preview: string
  updatedAt: number
  busy: boolean
}

/** Short relative stamp for the rail (`5h ago`), English like the UI. */
export function chatTimeAgo(updatedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The floating agent, in Fountible's two states: a collapsed pill with the
 * agent mark and name, and the expanded window with the session rail on the
 * left and the thread on the right.
 */
export function ChatFloating({
  designId,
  open,
  onOpenChange,
  className,
}: {
  designId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  const [sessions, setSessions] = useState<FloatSession[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const stored = (key: string): string | null => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    }
    void (async () => {
      try {
        const result = await orpc.chat.list({ designId })
        if (cancelled) return
        if (result.sessions.length === 0) {
          // First open behaves like the old panel: one active chat, no extra tap.
          const view = await orpc.chat.start({
            designId,
            model: stored('sheet:chat-model') ?? undefined,
            effort: stored('sheet:chat-effort') ?? undefined,
          })
          if (cancelled) {
            void orpc.chat.close({ sessionId: view.id }).catch(() => undefined)
            return
          }
          const entry: FloatSession = { id: view.id, preview: 'New chat', updatedAt: Date.now(), busy: view.busy }
          setSessions([entry])
          setCurrentId(entry.id)
          return
        }
        setSessions(result.sessions)
        setCurrentId((current) => {
          if (current && result.sessions.some((session) => session.id === current)) return current
          return result.sessions[0]?.id ?? null
        })
      } catch {
        // The thread shows the failure; the rail stays as it was.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [designId, open])

  if (!open) {
    return (
      <div
        data-chat-floating="true"
        className={cn('pointer-events-auto absolute bottom-3 left-3 z-30', className)}
      >
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Open Duma"
          title="Open Duma"
          className="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface px-2.5 py-2 text-foreground shadow-panel-lg outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-7 place-items-center rounded-md bg-cx-accent/15 text-cx-accent">
            <BotIcon className="size-4" />
          </span>
          <span className="text-[11px] font-medium leading-none">Duma</span>
        </button>
      </div>
    )
  }

  const current = sessions.find((session) => session.id === currentId) ?? null
  const older = sessions.filter((session) => session.id !== currentId)

  const startNew = () => {
    void (async () => {
      try {
        const view = await orpc.chat.start({ designId })
        const entry: FloatSession = { id: view.id, preview: 'New chat', updatedAt: Date.now(), busy: view.busy }
        setSessions((previous) => [entry, ...previous])
        setCurrentId(view.id)
      } catch {
        // The thread shows the failure; the rail stays as it was.
      }
    })()
  }

  return (
    <div
      data-chat-floating="true"
      className={cn(
        'pointer-events-auto absolute bottom-3 left-3 z-30 flex h-[480px] max-h-[calc(100%-1.5rem)] w-[560px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-panel-lg',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{current?.preview ?? 'New chat'}</p>
        <button
          type="button"
          onClick={startNew}
          aria-label="New chat"
          title="New chat"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Collapse chat"
          title="Collapse chat"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-44 shrink-0 flex-col border-e border-line">
          <p className="shrink-0 px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Chats
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
            {current ? (
              <button
                key={current.id}
                type="button"
                aria-current="true"
                onClick={() => setCurrentId(current.id)}
                className="rounded-md bg-secondary px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate text-xs font-medium text-foreground">{current.preview}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {current.busy ? 'Working' : 'Idle'}
                </span>
              </button>
            ) : null}
            {older.length > 0 ? (
              <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Older
              </p>
            ) : null}
            {older.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setCurrentId(session.id)}
                className="rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate text-xs text-foreground">{session.preview}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{chatTimeAgo(session.updatedAt)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {current ? (
            <ChatPanel key={current.id} designId={designId} sessionId={current.id} />
          ) : (
            <p className="px-3 py-4 text-xs text-muted-foreground">Opening chat…</p>
          )}
        </div>
      </div>
    </div>
  )
}
