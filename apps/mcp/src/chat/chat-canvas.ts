#!/usr/bin/env bun
/**
 * `bun run chat:canvas -- "tu petición"` — the chat proves it can work the
 * canvas: the ACP session opens with Sheet's own MCP endpoint attached as an
 * `http` MCP server (the exact shape Fountible passes OpenCode), so the agent
 * lists the 32 canvas tools and can call them.
 *
 * Safety for this stage: a read-only permission gate. Tools outside
 * READ_ONLY_TOOLS are denied at the ACP permission step, and the prompt tells
 * the agent not to modify anything. Writes (applyWebTransaction, …) come in
 * a later slice, through the same transaction vocabulary as the editor.
 */

import { isChatReadOnlyTool } from '@sheet/rpc/chat/opencode'
import { locateOpenCodeCli, startOpenCodeSession } from '@sheet/rpc/chat/opencode-session'

function toolCallName(toolCall: unknown): string {
  if (typeof toolCall !== 'object' || toolCall === null) return ''
  const call = toolCall as { name?: unknown; title?: unknown }
  return typeof call.name === 'string' ? call.name : typeof call.title === 'string' ? call.title : ''
}

const isReadOnly = isChatReadOnlyTool

const promptText =
  Bun.argv.slice(2).join(' ').trim() ||
  'Usa listDesigns para ver los diseños y getWebDocument para describir el contenido del primero. No modifiques nada.'
const log = (line: string) => console.error(line)

const cli = await locateOpenCodeCli(log)
if (!cli) {
  console.error('[canvas] no OpenCode 2 CLI found')
  process.exit(1)
}

const port = process.env.SHEET_MCP_PORT?.trim() || '4100'
const mcpUrl = `http://127.0.0.1:${port}/mcp`
try {
  const ready = await fetch(`http://127.0.0.1:${port}/ready`)
  if (!ready.ok) throw new Error(`status ${ready.status}`)
} catch {
  console.error(`[canvas] the local Sheet server is not up at :${port} — run \`bun run dev\` first, then retry`)
  process.exit(1)
}
console.error(`[canvas] attaching MCP ${mcpUrl}`)

const { acp, sessionId, agentName, close } = await startOpenCodeSession({
  designId: 'spike',
  cli,
  mcpServers: [{ type: 'http', name: 'sheet', url: mcpUrl, headers: [] }],
  onUpdate: (_sessionId, update) => {
    const text = (update as { content?: { text?: unknown } }).content?.text
    const chunk = typeof text === 'string' ? text : null
    if ((update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'user_message_chunk') && chunk) {
      process.stdout.write(chunk)
    } else {
      console.error(`\n[update] ${update.sessionUpdate}`)
    }
  },
  onServerRequest: async (method, params) => {
    if (method === 'session/request_permission') {
      const request = params as unknown as {
        toolCall?: unknown
        options: { optionId: string; kind: string; name?: string }[]
      }
      const name = toolCallName(request.toolCall)
      if (name && isReadOnly(name)) {
        const allow = request.options.find((option) => option.kind.startsWith('allow'))
        console.error(`[canvas] allowing ${name.slice(0, 120)}`)
        if (allow) return { outcome: { outcome: 'selected', optionId: allow.optionId } }
        return null
      }
      const reject = request.options.find((option) => option.kind.startsWith('reject'))
      console.error(`[canvas] denying ${name.slice(0, 120) || 'a tool'} (outside the read-only set)`)
      if (reject) return { outcome: { outcome: 'selected', optionId: reject.optionId } }
      return { outcome: { outcome: 'cancelled' } }
    }
    console.error(`[canvas] server asks: ${method}`)
    return null
  },
  onUnknown: (message) => console.error(`[canvas] other frame: ${JSON.stringify(message).slice(0, 300)}`),
  onStderr: (line) => console.error(`[opencode] ${line}`),
})
console.error(`[canvas] agent: ${agentName}`)
console.error(`[canvas] session ${sessionId}`)

// A prompt with no tools beats a turn that never starts: give OpenCode a
// bounded wait to list the canvas tools before asking. (Fountible detects
// the listing server-side in its bridge; the follow-up is to count
// tools/list hits in handler.ts instead of sleeping.)
await Bun.sleep(20_000)

const result = (await acp.request(
  'session/prompt',
  { sessionId, prompt: [{ type: 'text', text: promptText }] },
  300_000,
)) as { stopReason?: string; usage?: unknown }
process.stdout.write('\n')
console.error(`[canvas] stop: ${result.stopReason ?? 'done'} usage: ${JSON.stringify(result.usage ?? null)}`)
close()
process.exit(0)
