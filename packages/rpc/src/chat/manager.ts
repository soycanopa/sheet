import { LOCAL_USER_ID } from '@sheet/db'
import { publishLocalEvent } from '@sheet/realtime/local-bus'
import type { SessionUpdate } from './acp-client'
import { CHAT_EFFORT_LEVELS, chatEffortCandidates, isChatReadOnlyTool, summarizeChatModels, type ChatModelEntry } from './opencode'
import { locateOpenCodeCli, startOpenCodeSession, waitForListedTools, type StartedSession } from './opencode-session'

export interface ChatMessage {
  role: 'user' | 'agent' | 'tool'
  text: string
  tool?: string
}

export interface ChatSessionView {
  id: string
  designId: string
  model: string | null
  effort: string
  models: { value: string; name: string }[]
  efforts: { value: string; label: string }[]
  busy: boolean
  transcript: ChatMessage[]
}

interface ManagedSession {
  id: string
  designId: string
  started: StartedSession
  model: string | null
  effort: string
  appliedModel: string | null
  appliedEffort: string | null
  busy: boolean
  seq: number
  transcript: ChatMessage[]
  currentText: string
  listedTools: boolean
  listedAt: number
}

const MAX_TRANSCRIPT = 200
const TURN_TIMEOUT_MS = 300_000

function delta(
  session: ManagedSession,
  kind: 'text' | 'thinking' | 'tool' | 'usage' | 'done' | 'error',
  fields: { text?: string; tool?: string; stopReason?: string | null; usage?: { inputTokens: number; outputTokens: number } | null; message?: string | null } = {},
): void {
  session.seq += 1
  publishLocalEvent(LOCAL_USER_ID, { designId: session.designId }, {
    type: 'chat.delta',
    sessionId: session.id,
    seq: session.seq,
    kind,
    ...fields,
  })
}

function pushTranscript(session: ManagedSession, message: ChatMessage): void {
  session.transcript.push(message)
  if (session.transcript.length > MAX_TRANSCRIPT) {
    session.transcript.splice(0, session.transcript.length - MAX_TRANSCRIPT)
  }
}

function updateText(update: SessionUpdate): string | null {
  const text = (update as { content?: { text?: unknown } }).content?.text
  return typeof text === 'string' && text.length > 0 ? text : null
}

function toolNameOf(call: unknown): string {
  if (typeof call !== 'object' || call === null) return 'a tool'
  const record = call as { name?: unknown; title?: unknown }
  if (typeof record.name === 'string' && record.name) return record.name
  if (typeof record.title === 'string' && record.title) return record.title
  return 'a tool'
}

function findConfigOption(options: unknown[], id: string, category: string): { id: string; values: string[]; current: string | null } | null {
  for (const option of options) {
    if (typeof option !== 'object' || option === null) continue
    const record = option as { id?: unknown; category?: unknown; currentValue?: unknown; options?: unknown }
    if (record.id !== id && record.category !== category) continue
    const values: string[] = []
    const visit = (entries: unknown): void => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry !== 'object' || entry === null) continue
        const item = entry as { value?: unknown; options?: unknown }
        if (typeof item.value === 'string') values.push(item.value)
        visit(item.options)
      }
    }
    visit(record.options)
    return {
      id: typeof record.id === 'string' ? record.id : id,
      values,
      current: typeof record.currentValue === 'string' ? record.currentValue : null,
    }
  }
  return null
}

function mcpPort(): string {
  return process.env.SHEET_MCP_PORT?.trim() || '4100'
}

/** One OpenCode process per chat, held by the local server. Not persisted. */
class ChatManager {
  private sessions = new Map<string, ManagedSession>()
  private cliPath: string | null | undefined

  private async cli(): Promise<string | null> {
    if (this.cliPath === undefined) {
      this.cliPath = await locateOpenCodeCli(() => undefined)
    }
    return this.cliPath
  }

  async status(): Promise<{ found: boolean; version: string | null; sessions: number }> {
    const cli = await this.cli()
    if (!cli) return { found: false, version: null, sessions: this.sessions.size }
    const proc = Bun.spawn([cli, '--version'], { stdout: 'pipe', stderr: 'ignore', timeout: 15_000 })
    const text = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    const match = /(\d+\.\d+\.\d+)/.exec(text)
    return { found: true, version: match ? match[1]! : null, sessions: this.sessions.size }
  }

  async models(): Promise<ChatModelEntry[]> {
    const cli = await this.cli()
    if (!cli) return []
    const run = async (args: string[]): Promise<string> => {
      const proc = Bun.spawn([cli, ...args], {
        stdout: 'pipe',
        stderr: 'ignore',
        timeout: 30_000,
        env: { ...process.env, OPENCODE_DISABLE_CLAUDE_CODE: '1' },
      })
      const text = await new Response(proc.stdout).text()
      await proc.exited
      return text
    }
    const [list, catalog] = await Promise.all([run(['models']), run(['api', 'model.list'])])
    return summarizeChatModels(list, catalog)
  }

  private view(session: ManagedSession): ChatSessionView {
    const modelOption = findConfigOption(session.started.configOptions, 'model', 'model')
    return {
      id: session.id,
      designId: session.designId,
      model: session.model ?? modelOption?.current ?? null,
      effort: session.effort,
      models: modelOptions(session.started.configOptions),
      efforts: CHAT_EFFORT_LEVELS.map((level) => ({ value: level.value, label: level.label })),
      busy: session.busy,
      transcript: [...session.transcript],
    }
  }

  async start(designId: string, opts: { model?: string; effort?: string }): Promise<ChatSessionView> {
    const cli = await this.cli()
    if (!cli) throw new Error('OpenCode is not installed on this machine.')
    const id = crypto.randomUUID()
    const effort = opts.effort ?? 'auto'
    const session: ManagedSession = {
      id,
      designId,
      started: null as never,
      model: opts.model ?? null,
      effort,
      appliedModel: null,
      appliedEffort: null,
      busy: false,
      seq: 0,
      transcript: [],
      currentText: '',
      listedTools: false,
      listedAt: Date.now(),
    }
    const url = `http://127.0.0.1:${mcpPort()}/mcp`
    session.started = await startOpenCodeSession({
      cli,
      designId,
      mcpServers: [{ type: 'http', name: 'sheet', url, headers: [] }],
      onUpdate: (acpSessionId, update) => this.onUpdate(session, acpSessionId, update),
      onServerRequest: (method, params) => this.onServerRequest(session, method, params),
      onStderr: () => undefined,
    })
    this.sessions.set(id, session)
    await this.applyConfig(session)
    return this.view(session)
  }

  private onUpdate(session: ManagedSession, acpSessionId: string, update: SessionUpdate): void {
    void acpSessionId
    const kind = update.sessionUpdate
    if (kind === 'agent_message_chunk' || kind === 'user_message_chunk') {
      const chunk = updateText(update)
      if (!chunk) return
      session.currentText += chunk
      delta(session, 'text', { text: chunk })
      return
    }
    if (kind === 'agent_thought_chunk') {
      const chunk = updateText(update)
      if (chunk) delta(session, 'thinking', { text: chunk.slice(0, 2000) })
      return
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      session.listedTools = true
      const call = (update as { toolCall?: unknown }).toolCall ?? update
      const name = toolNameOf(call)
      delta(session, 'tool', { tool: name.slice(0, 200) })
      return
    }
    if (kind === 'usage_update') {
      const usage = (update as { usage?: { inputTokens?: unknown; outputTokens?: unknown } }).usage
      const input = typeof usage?.inputTokens === 'number' ? usage.inputTokens : 0
      const output = typeof usage?.outputTokens === 'number' ? usage.outputTokens : 0
      delta(session, 'usage', { usage: { inputTokens: input, outputTokens: output } })
    }
  }

  private async onServerRequest(
    session: ManagedSession,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (method !== 'session/request_permission') return null
    const request = params as unknown as {
      toolCall?: unknown
      options?: { optionId?: unknown; kind?: unknown; name?: unknown }[]
    }
    const name = toolNameOf(request.toolCall)
    const options = (request.options ?? []).filter(
      (option): option is { optionId: string; kind: string } =>
        typeof option?.optionId === 'string' && typeof option?.kind === 'string',
    )
    const pick = (prefix: string) => options.find((option) => option.kind.startsWith(prefix))
    if (isChatReadOnlyTool(name)) {
      session.listedTools = true
      const allow = pick('allow')
      pushTranscript(session, { role: 'tool', text: '', tool: name.slice(0, 200) })
      delta(session, 'tool', { tool: name.slice(0, 200) })
      if (allow) return { outcome: { outcome: 'selected', optionId: allow.optionId } }
      return null
    }
    const reject = pick('reject')
    delta(session, 'tool', { tool: `denied ${name.slice(0, 120)}` })
    if (reject) return { outcome: { outcome: 'selected', optionId: reject.optionId } }
    return { outcome: { outcome: 'cancelled' } }
  }

  private async applyConfig(session: ManagedSession): Promise<void> {
    const options = session.started.configOptions
    const request = (method: string, params: Record<string, unknown>) =>
      session.started.acp.request(method, params, 30_000) as Promise<{ configOptions?: unknown[] }>
    if (session.model && session.appliedModel !== session.model) {
      const modelOption = findConfigOption(options, 'model', 'model')
      if (modelOption && modelOption.values.includes(session.model)) {
        if (modelOption.current !== session.model) {
          const result = await request('session/set_config_option', {
            sessionId: session.started.sessionId,
            configId: modelOption.id,
            value: session.model,
          })
          if (Array.isArray(result?.configOptions)) session.started.configOptions = result.configOptions
        }
        session.appliedEffort = null
      }
      session.appliedModel = session.model
    }
    const effortOption = findConfigOption(options, 'effort', 'thought_level')
    if (effortOption) {
      const effort = chatEffortCandidates(session.effort).find((candidate) => effortOption.values.includes(candidate))
      if (effort && session.appliedEffort !== effort) {
        if (effortOption.current !== effort) {
          const result = await request('session/set_config_option', {
            sessionId: session.started.sessionId,
            configId: effortOption.id,
            value: effort,
          })
          if (Array.isArray(result?.configOptions)) session.started.configOptions = result.configOptions
        }
        session.appliedEffort = effort
      }
    }
  }

  async send(id: string, text: string, opts: { model?: string; effort?: string }): Promise<{ accepted: boolean }> {
    const session = this.sessions.get(id)
    if (!session) throw new Error('Unknown chat session.')
    if (session.busy) throw new Error('The chat is already working on a turn.')
    if (opts.model !== undefined) session.model = opts.model
    if (opts.effort !== undefined) session.effort = opts.effort
    session.busy = true
    session.currentText = ''
    pushTranscript(session, { role: 'user', text: text.slice(0, 20_000) })
    void this.runTurn(session, text).finally(() => {
      session.busy = false
    })
    return { accepted: true }
  }

  private async runTurn(session: ManagedSession, text: string): Promise<void> {
    try {
      if (!session.listedTools && Date.now() - session.listedAt < 8_000) {
        await waitForListedTools()
      }
      await this.applyConfig(session)
      const result = (await session.started.acp.request(
        'session/prompt',
        { sessionId: session.started.sessionId, prompt: [{ type: 'text', text }] },
        TURN_TIMEOUT_MS,
      )) as { stopReason?: unknown; usage?: { inputTokens?: unknown; outputTokens?: unknown } }
      if (session.currentText) {
        pushTranscript(session, { role: 'agent', text: session.currentText })
        session.currentText = ''
      }
      const usage = result?.usage
      delta(session, 'done', {
        stopReason: typeof result?.stopReason === 'string' ? result.stopReason : 'done',
        usage: {
          inputTokens: typeof usage?.inputTokens === 'number' ? usage.inputTokens : 0,
          outputTokens: typeof usage?.outputTokens === 'number' ? usage.outputTokens : 0,
        },
      })
    } catch (error) {
      if (session.currentText) {
        pushTranscript(session, { role: 'agent', text: session.currentText })
        session.currentText = ''
      }
      const message = error instanceof Error ? error.message : String(error)
      delta(session, 'error', { message: message.slice(0, 500) })
    }
  }

  async cancel(id: string): Promise<{ cancelled: boolean }> {
    const session = this.sessions.get(id)
    if (!session) throw new Error('Unknown chat session.')
    session.started.acp.notify('session/cancel', { sessionId: session.started.sessionId })
    return { cancelled: true }
  }

  history(id: string): ChatMessage[] {
    const session = this.sessions.get(id)
    if (!session) throw new Error('Unknown chat session.')
    return [...session.transcript]
  }

  close(id: string): { closed: boolean } {
    const session = this.sessions.get(id)
    if (!session) return { closed: false }
    this.sessions.delete(id)
    try {
      session.started.close()
    } catch {
      // Already gone — nothing to stop.
    }
    return { closed: true }
  }
}

function modelOptions(configOptions: unknown[]): { value: string; name: string }[] {
  for (const option of configOptions) {
    if (typeof option !== 'object' || option === null) continue
    const record = option as { id?: unknown; category?: unknown; options?: unknown }
    if (record.id !== 'model' && record.category !== 'model') continue
    const entries: { value: string; name: string }[] = []
    const visit = (items: unknown): void => {
      for (const item of Array.isArray(items) ? items : []) {
        if (typeof item !== 'object' || item === null) continue
        const entry = item as { value?: unknown; name?: unknown; options?: unknown }
        if (typeof entry.value === 'string') {
          entries.push({ value: entry.value, name: typeof entry.name === 'string' ? entry.name : entry.value })
        }
        visit(entry.options)
      }
    }
    visit(record.options)
    return entries
  }
  return []
}

export const chatManager = new ChatManager()
