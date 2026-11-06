/**
 * Minimal Agent Client Protocol (ACP) connection over stdio.
 *
 * Speaks the slice of ACP the chat needs: `initialize`, `session/new`,
 * `session/prompt`, `session/cancel`, plus the server-to-client
 * `session/update` stream and `session/request_permission` (answered by the
 * caller). Anything else is surfaced to the caller as unknown traffic so the
 * spike — and later the panel — can grow without guessing.
 *
 * Wire format is newline-delimited JSON-RPC, exactly what `opencode acp`
 * serves.
 */

export interface AcpContentBlock {
  type: 'text' | 'image' | 'resource' | 'resource_link' | 'audio'
  text?: string
  data?: string
  mimeType?: string
  uri?: string
}

export type SessionUpdate =
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | { sessionUpdate: string; [key: string]: unknown }

export interface PermissionOption {
  optionId: string
  name: string
  kind: string
}

export interface PermissionRequest {
  sessionId: string
  toolCall: { title?: string; name?: string; [key: string]: unknown }
  options: PermissionOption[]
}

export type ServerRequestHandler = (
  method: string,
  params: Record<string, unknown>,
) => unknown | Promise<unknown>

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface SpawnedProcess {
  stdin: { write: (chunk: string) => void; flush?: () => void }
  stdout: ReadableStream<Uint8Array>
  kill: () => void
  onStderr?: (line: string) => void
}

const DEFAULT_TIMEOUT_MS = 90_000

export class AcpConnection {
  private nextId = 1
  private pending = new Map<number, Pending>()
  private buffer = ''
  private closed: Error | null = null

  onUpdate: ((sessionId: string, update: SessionUpdate) => void) | null = null
  onUnknown: ((message: Record<string, unknown>) => void) | null = null
  handleServerRequest: ServerRequestHandler | null = null

  constructor(private readonly proc: SpawnedProcess) {
    void this.pump()
  }

  private sendFrame(frame: Record<string, unknown>): void {
    this.proc.stdin.write(`${JSON.stringify(frame)}\n`)
    this.proc.stdin.flush?.()
  }

  request(method: string, params: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) return Promise.reject(this.closed)
    const id = this.nextId
    this.nextId += 1
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`ACP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.sendFrame({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: Record<string, unknown>): void {
    if (!this.closed) this.sendFrame({ jsonrpc: '2.0', method, params })
  }

  private async pump(): Promise<void> {
    const reader = this.proc.stdout.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        this.buffer += decoder.decode(value, { stream: true })
        const parts = this.buffer.split('\n')
        this.buffer = parts.pop() ?? ''
        for (const part of parts) {
          if (part.trim()) this.route(part.trim())
        }
      }
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
    } finally {
      reader.releaseLock()
    }
  }

  private route(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(message.id as number)
      if (!pending) return
      this.pending.delete(message.id as number)
      clearTimeout(pending.timer)
      if (message.error !== undefined) {
        pending.reject(new Error(`ACP error: ${JSON.stringify(message.error).slice(0, 300)}`))
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (typeof message.method === 'string' && message.id !== undefined) {
      void this.answerServerRequest(message.id as number, message.method, (message.params ?? {}) as Record<string, unknown>)
      return
    }
    if (message.method === 'session/update') {
      const params = (message.params ?? {}) as { sessionId?: string; update?: SessionUpdate }
      if (typeof params.sessionId === 'string' && params.update && this.onUpdate) {
        this.onUpdate(params.sessionId, params.update)
      }
      return
    }
    this.onUnknown?.(message)
  }

  private async answerServerRequest(id: number, method: string, params: Record<string, unknown>): Promise<void> {
    try {
      const result = (await this.handleServerRequest?.(method, params)) ?? null
      this.sendFrame({ jsonrpc: '2.0', id, result })
    } catch (error) {
      this.sendFrame({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  private failAll(error: Error): void {
    this.closed = error
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  close(): void {
    this.failAll(new Error('ACP connection closed'))
    this.proc.kill()
  }
}

/** Split one stdout chunk into complete lines, keeping the rest buffered. */
export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const combined = buffer + chunk
  const parts = combined.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts.filter((line) => line.trim().length > 0), rest }
}
