import { apiUrl } from '@sheet/platform'

/** An agent working in the document, as the server announces it. */
export interface AgentActivity {
  id: string
  label: string
  nodeIds: string[]
  phase: 'working' | 'settled'
  expiresAt: number
}

function parseActivity(value: unknown): AgentActivity | null {
  if (!value || typeof value !== 'object') return null
  const id = Reflect.get(value, 'id')
  const label = Reflect.get(value, 'label')
  const nodeIds = Reflect.get(value, 'nodeIds')
  const phase = Reflect.get(value, 'phase')
  const expiresAt = Reflect.get(value, 'expiresAt')
  if (
    typeof id !== 'string' ||
    typeof label !== 'string' ||
    !Array.isArray(nodeIds) ||
    (phase !== 'working' && phase !== 'settled') ||
    typeof expiresAt !== 'number'
  ) {
    return null
  }
  return {
    id,
    label,
    nodeIds: nodeIds.filter((item): item is string => typeof item === 'string'),
    phase,
    expiresAt,
  }
}

/** A streamed fragment of the internal chat, as the server announces it. */
export interface ChatDelta {
  sessionId: string
  seq: number
  kind: 'text' | 'thinking' | 'tool' | 'usage' | 'done' | 'error'
  text?: string
  tool?: string
  stopReason?: string | null
  usage?: { inputTokens: number; outputTokens: number } | null
  message?: string | null
}

function parseChatDelta(value: unknown): ChatDelta | null {
  if (!value || typeof value !== 'object') return null
  const sessionId = Reflect.get(value, 'sessionId')
  const seq = Reflect.get(value, 'seq')
  const kind = Reflect.get(value, 'kind')
  if (typeof sessionId !== 'string' || typeof seq !== 'number' || !Number.isInteger(seq)) return null
  if (kind !== 'text' && kind !== 'thinking' && kind !== 'tool' && kind !== 'usage' && kind !== 'done' && kind !== 'error') {
    return null
  }
  const text = Reflect.get(value, 'text')
  const tool = Reflect.get(value, 'tool')
  const usage = Reflect.get(value, 'usage')
  return {
    sessionId,
    seq,
    kind,
    text: typeof text === 'string' ? text : undefined,
    tool: typeof tool === 'string' ? tool : undefined,
    stopReason: typeof Reflect.get(value, 'stopReason') === 'string' ? (Reflect.get(value, 'stopReason') as string) : null,
    usage:
      usage && typeof usage === 'object' && typeof Reflect.get(usage, 'inputTokens') === 'number' && typeof Reflect.get(usage, 'outputTokens') === 'number'
        ? {
            inputTokens: Reflect.get(usage, 'inputTokens') as number,
            outputTokens: Reflect.get(usage, 'outputTokens') as number,
          }
        : null,
    message: typeof Reflect.get(value, 'message') === 'string' ? (Reflect.get(value, 'message') as string) : null,
  }
}

export function subscribeCanvasChanges(
  designId: string | null,
  onChange: (revision: number) => void,
  options: {
    draftId?: string | null
    onReady?: () => void
    /** Called with the running or just-finished agent activity, or `null` when it clears. */
    onAgentActivity?: (activity: AgentActivity | null) => void
    /** Called with each streamed fragment of the internal chat. */
    onChatDelta?: (delta: ChatDelta) => void
  } = {},
) {
  if (typeof EventSource === 'undefined') return () => {}
  const url = new URL(apiUrl('/api/canvas-events'))
  if (designId) url.searchParams.set('designId', designId)
  if (options.draftId) url.searchParams.set('draftId', options.draftId)
  const source = new EventSource(url, { withCredentials: true })
  const handleChange = (message: Event) => {
    if (!(message instanceof MessageEvent)) return
    try {
      const event: unknown = JSON.parse(String(message.data))
      if (!event || typeof event !== 'object' || !('type' in event)) return
      if (
        event.type === 'canvas.changed' &&
        'revision' in event &&
        typeof event.revision === 'number' &&
        Number.isInteger(event.revision) &&
        event.revision >= 0
      ) {
        onChange(event.revision)
      } else if (event.type === 'agent.activity' && 'activity' in event) {
        options.onAgentActivity?.(parseActivity(event.activity))
      } else if (event.type === 'chat.delta') {
        const delta = parseChatDelta(event)
        if (delta) options.onChatDelta?.(delta)
      }
    } catch {
      // Ignore malformed stream frames; EventSource reconnects itself.
    }
  }
  const handleReady = () => options.onReady?.()
  source.addEventListener('canvas', handleChange)
  source.addEventListener('ready', handleReady)
  return () => {
    source.removeEventListener('canvas', handleChange)
    source.removeEventListener('ready', handleReady)
    source.close()
  }
}
