import { useEffect, useRef, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import { SendIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { OpenCodeLogo } from './agent-logos'
import { subscribeCanvasChanges, type ChatDelta } from '../lib/canvas-events'

interface ChatMsg {
  role: 'user' | 'agent' | 'tool'
  text: string
  tool?: string
}

interface ChatSessionState {
  id: string
  models: { value: string; name: string }[]
  model: string | null
  efforts: { value: string; label: string }[]
  effort: string
  messages: ChatMsg[]
}

type PanelState =
  | { phase: 'loading' }
  | { phase: 'off' }
  | { phase: 'failed'; message: string }
  | ({ phase: 'on' } & ChatSessionState & { busy: boolean; streaming: string; activity: string | null })

/** Sessions survive tab switches; the server forgets them on restart. */
const liveSessions = new Map<string, ChatSessionState>()

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A full or blocked store never breaks the chat.
  }
}

/**
 * The internal chat's thread: model and effort selectors copied from
 * Fountible's scale, a composer, and the streamed OpenCode turn. Availability
 * still belongs to the switch in Settings › Agents.
 */
export function ChatPanel({ designId, className }: { designId: string; className?: string }) {
  const [state, setState] = useState<PanelState>({ phase: 'loading' })
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    const cached = liveSessions.get(designId)
    void (async () => {
      try {
        const status = await orpc.chat.status()
        if (cancelled) return
        if (!status.enabled) {
          setState({ phase: 'off' })
          return
        }
        if (cached) {
          try {
            const history = await orpc.chat.history({ sessionId: cached.id })
            if (cancelled) return
            setState({ phase: 'on', ...cached, messages: history.transcript, busy: false, streaming: '', activity: null })
            return
          } catch {
            liveSessions.delete(designId)
          }
        }
        const view = await orpc.chat.start({
          designId,
          model: stored('sheet:chat-model') ?? undefined,
          effort: stored('sheet:chat-effort') ?? undefined,
        })
        if (cancelled) {
          void orpc.chat.close({ sessionId: view.id }).catch(() => undefined)
          return
        }
        const next: ChatSessionState = {
          id: view.id,
          models: view.models,
          model: view.model,
          efforts: view.efforts,
          effort: view.effort,
          messages: view.transcript,
        }
        liveSessions.set(designId, next)
        setState({ phase: 'on', ...next, busy: view.busy, streaming: '', activity: null })
      } catch (cause) {
        if (!cancelled) {
          setState({
            phase: 'failed',
            message: cause instanceof Error ? cause.message : 'The chat could not start.',
          })
        }
      }
    })()
    const unsubscribe = subscribeCanvasChanges(
      designId,
      () => undefined,
      {
        onChatDelta: (delta: ChatDelta) => {
          const current = stateRef.current
          if (current.phase !== 'on') return
          const cachedSession = liveSessions.get(designId)
          if (!cachedSession || delta.sessionId !== current.id) return
          if (delta.kind === 'text' && delta.text) {
            const streaming = current.streaming + delta.text
            setState({ ...current, streaming })
            return
          }
          if (delta.kind === 'thinking') return
          if (delta.kind === 'tool' && delta.tool) {
            const activity = delta.tool.startsWith('denied ') ? delta.tool : `Called ${delta.tool}`
            const messages: ChatMsg[] = [...current.messages, { role: 'tool', text: '', tool: delta.tool }]
            cachedSession.messages = messages
            setState({ ...current, messages, activity })
            return
          }
          if (delta.kind === 'done' || delta.kind === 'error' || delta.kind === 'usage') {
            const messages = [...current.messages]
            if (current.streaming) {
              messages.push({ role: 'agent', text: current.streaming })
            }
            if (delta.kind === 'error') {
              messages.push({ role: 'agent', text: delta.message ?? 'The turn failed.' })
            }
            cachedSession.messages = messages
            setState({ ...current, messages, streaming: '', busy: false, activity: null })
          }
        },
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [designId])

  useEffect(() => {
    const node = bottomRef.current
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'end' })
  }, [state])

  if (state.phase === 'loading') {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <p className="px-3 py-4 text-xs text-muted-foreground">Opening chat…</p>
      </div>
    )
  }

  if (state.phase === 'off') {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 px-4 py-8">
          <p className="text-xs font-medium text-foreground">Internal chat is off</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Turn it on in Settings › Agents to work the canvas with OpenCode.
          </p>
        </div>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 px-4 py-8">
          <p className="text-xs font-medium text-foreground">Chat could not start</p>
          <p role="alert" className="text-xs leading-relaxed text-muted-foreground">
            {state.message}
          </p>
        </div>
      </div>
    )
  }

  const send = () => {
    const text = draft.trim()
    if (!text || state.busy) return
    setDraft('')
    const messages: ChatMsg[] = [...state.messages]
    if (state.streaming) messages.push({ role: 'agent', text: state.streaming })
    messages.push({ role: 'user', text })
    const cached = liveSessions.get(designId)
    if (cached) cached.messages = messages
    setState({ ...state, messages, streaming: '', busy: true, activity: 'Thinking' })
    void orpc.chat
      .send({ sessionId: state.id, text, model: state.model ?? undefined, effort: state.effort })
      .catch((cause: unknown) => {
        const current = stateRef.current
        if (current.phase !== 'on' || current.id !== state.id) return
        const failed: ChatMsg[] = [...current.messages, { role: 'agent', text: cause instanceof Error ? cause.message : 'The turn failed.' }]
        const session = liveSessions.get(designId)
        if (session) session.messages = failed
        setState({ ...current, messages: failed, streaming: '', busy: false, activity: null })
      })
  }

  const stop = () => {
    void orpc.chat.cancel({ sessionId: state.id }).catch(() => undefined)
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <OpenCodeLogo className="size-4 shrink-0" />
        <select
          aria-label="Model"
          value={state.model ?? ''}
          disabled={state.models.length === 0}
          onChange={(event) => {
            const model = event.target.value || null
            store('sheet:chat-model', event.target.value)
            const cached = liveSessions.get(designId)
            if (cached) cached.model = model
            setState({ ...state, model })
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-line focus-visible:border-ring"
        >
          {state.model === null ? <option value="">Default model</option> : null}
          {state.models.map((model) => (
            <option key={model.value} value={model.value}>
              {model.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Effort"
          value={state.effort}
          onChange={(event) => {
            store('sheet:chat-effort', event.target.value)
            const cached = liveSessions.get(designId)
            if (cached) cached.effort = event.target.value
            setState({ ...state, effort: event.target.value })
          }}
          className="h-7 w-24 shrink-0 rounded-md border border-transparent bg-transparent px-1 text-xs outline-none hover:border-line focus-visible:border-ring"
        >
          {state.efforts.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {state.messages.length === 0 && !state.streaming ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ask about this design. Reads are free; writes stay denied until approvals land.
          </p>
        ) : null}
        {state.messages.map((message, index) =>
          message.role === 'tool' ? (
            <p key={index} className="text-[11px] leading-relaxed text-muted-foreground">
              {message.tool?.startsWith('denied ') ? message.tool : `Called ${message.tool ?? 'a tool'}`}
            </p>
          ) : (
            <div
              key={index}
              className={cn(
                'max-w-full whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
                message.role === 'user' ? 'self-end bg-secondary text-foreground' : 'self-start bg-well text-foreground',
              )}
            >
              {message.text}
            </div>
          ),
        )}
        {state.streaming ? (
          <div className="max-w-full self-start whitespace-pre-wrap break-words rounded-lg bg-well px-2.5 py-1.5 text-xs leading-relaxed text-foreground">
            {state.streaming}
          </div>
        ) : null}
        {state.busy && !state.streaming ? (
          <p className="text-[11px] text-muted-foreground">{state.activity ?? 'Thinking'}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        <input
          aria-label="Message"
          value={draft}
          placeholder="Ask about this design…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring"
        />
        {state.busy ? (
          <button
            type="button"
            onClick={stop}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Stop"
            title="Stop"
          >
            <span className="size-3 rounded-[3px] bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            aria-label="Send"
            title="Send"
          >
            <SendIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
