import { useEffect, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import { BotIcon, ChevronDownIcon, PlusIcon, XIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { ChatPanel } from './chat-panel'

export interface FloatSession {
  id: string
  preview: string
  updatedAt: number
  busy: boolean
}

const FLOAT_SIZE_KEY = 'sheet:chat-float-size'
const FLOAT_MIN_W = 340
const FLOAT_MIN_H = 380
const FLOAT_DEFAULT_SIZE = { w: 560, h: 480 }

export interface FloatSize {
  w: number
  h: number
}

function loadFloatSize(): FloatSize {
  try {
    const raw = window.localStorage.getItem(FLOAT_SIZE_KEY)
    if (!raw) return FLOAT_DEFAULT_SIZE
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return FLOAT_DEFAULT_SIZE
    const { w, h } = parsed as { w?: unknown; h?: unknown }
    if (typeof w !== 'number' || typeof h !== 'number') return FLOAT_DEFAULT_SIZE
    return {
      w: Math.max(FLOAT_MIN_W, Math.round(w)),
      h: Math.max(FLOAT_MIN_H, Math.round(h)),
    }
  } catch {
    return FLOAT_DEFAULT_SIZE
  }
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
  const [size, setSize] = useState<FloatSize>(loadFloatSize)
  const [loaded, setLoaded] = useState(false)

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
          setLoaded(true)
          return
        }
        setSessions(result.sessions)
        setCurrentId((current) => {
          if (current && result.sessions.some((session) => session.id === current)) return current
          return result.sessions[0]?.id ?? null
        })
        setLoaded(true)
        return
      } catch {
        // The thread shows the failure; the rail stays as it was.
      }
      setLoaded(true)
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

  const removeSession = (id: string) => {
    // The server drops the stored row too, so a deleted chat never comes back.
    void orpc.chat.close({ sessionId: id }).catch(() => undefined)
    const next = sessions.filter((session) => session.id !== id)
    setSessions(next)
    setCurrentId((current) => (current !== id ? current : (next[0]?.id ?? null)))
  }

  /**
   * The window sits in the bottom-left corner, so it grows up and right:
   * the top edge pulls the height, the right edge the width, and the
   * top-right corner both at once.
   */
  const startResize = (mode: 'top' | 'right' | 'corner') => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const origin = { x: event.clientX, y: event.clientY, w: size.w, h: size.h }
    const onMove = (move: PointerEvent) => {
      setSize({
        w: mode === 'top' ? origin.w : Math.max(FLOAT_MIN_W, Math.round(origin.w + move.clientX - origin.x)),
        h: mode === 'right' ? origin.h : Math.max(FLOAT_MIN_H, Math.round(origin.h - (move.clientY - origin.y))),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setSize((current) => {
        try {
          window.localStorage.setItem(FLOAT_SIZE_KEY, JSON.stringify(current))
        } catch {
          // A blocked store never breaks the chat.
        }
        return current
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      data-chat-floating="true"
      data-testid="chat-float-window"
      style={{ width: size.w, height: size.h }}
      className={cn(
        'pointer-events-auto absolute bottom-3 left-3 z-30 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-panel-lg',
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
              <div
                key={current.id}
                className="group flex items-start gap-1 rounded-md bg-secondary px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <button
                  type="button"
                  aria-current="true"
                  onClick={() => setCurrentId(current.id)}
                  className="min-w-0 flex-1 text-left outline-none"
                >
                  <span className="block truncate text-xs font-medium text-foreground">{current.preview}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {current.busy ? 'Working' : 'Idle'}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${current.preview}`}
                  title="Delete chat"
                  onClick={() => removeSession(current.id)}
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ) : null}
            {older.length > 0 ? (
              <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Older
              </p>
            ) : null}
            {older.map((session) => (
              <div
                key={session.id}
                className="group flex items-start gap-1 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <button
                  type="button"
                  onClick={() => setCurrentId(session.id)}
                  className="min-w-0 flex-1 text-left outline-none"
                >
                  <span className="block truncate text-xs text-foreground">{session.preview}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{chatTimeAgo(session.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${session.preview}`}
                  title="Delete chat"
                  onClick={() => removeSession(session.id)}
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {current ? (
            <ChatPanel key={current.id} designId={designId} sessionId={current.id} />
          ) : loaded ? (
            <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 px-4 py-8">
              <p className="text-xs font-medium text-foreground">No chats yet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Deleted chats stay deleted. Start a fresh one with Duma.
              </p>
              <button
                type="button"
                onClick={startNew}
                className="mt-1 rounded-md bg-cx-accent px-2.5 py-1.5 text-xs font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
              >
                New chat
              </button>
            </div>
          ) : (
            <p className="px-3 py-4 text-xs text-muted-foreground">Opening chat…</p>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-label="Resize chat height"
        aria-orientation="horizontal"
        title="Drag to resize height"
        onPointerDown={startResize('top')}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none outline-none hover:bg-cx-accent/20 focus-visible:bg-cx-accent/20"
      />
      <div
        role="separator"
        aria-label="Resize chat width"
        aria-orientation="vertical"
        title="Drag to resize width"
        onPointerDown={startResize('right')}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize touch-none outline-none hover:bg-cx-accent/20 focus-visible:bg-cx-accent/20"
      />
      <div
        role="separator"
        aria-label="Resize chat"
        aria-orientation="horizontal"
        title="Drag to resize"
        onPointerDown={startResize('corner')}
        className="absolute right-0 top-0 z-10 size-2.5 cursor-nesw-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 block h-2 w-2 rounded-tr border-r-2 border-t-2 border-muted-foreground/70" />
      </div>
    </div>
  )
}
