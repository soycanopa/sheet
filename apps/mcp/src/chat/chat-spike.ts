#!/usr/bin/env bun
/**
 * `bun run chat:spike -- "tu pregunta"` — end-to-end ACP check against the
 * OpenCode installed on this Mac. No UI, no MCP tools yet: locate the CLI,
 * open an ACP session in a private config dir, stream one prompt turn to
 * stdout, print usage, exit.
 *
 * Everything the agent can touch is denied (see onPermission): the spike
 * proves the wire, not tool execution.
 */

import { locateOpenCodeCli, startOpenCodeSession } from '@sheet/rpc/chat/opencode-session'

const promptText = Bun.argv.slice(2).join(' ').trim() || 'Responde en una línea: ¿qué modelo eres?'
const log = (line: string) => console.error(line)

const cli = await locateOpenCodeCli(log)
if (!cli) {
  console.error('[spike] no OpenCode 2 CLI found (looked for opencode2/opencode on PATH dirs and the OpenCode app copy)')
  process.exit(1)
}

let streamed = ''
const { acp, sessionId, agentName, close } = await startOpenCodeSession({
  cli,
  designId: 'spike',
  mcpServers: [],
  onUpdate: (_sessionId, update) => {
    const text = (update as { content?: { text?: unknown } }).content?.text
    const chunk = typeof text === 'string' ? text : null
    if ((update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'user_message_chunk') && chunk) {
      streamed += chunk
      process.stdout.write(chunk)
    } else if (update.sessionUpdate === 'agent_thought_chunk' && chunk) {
      console.error(`\n[thinking] ${chunk.slice(0, 200)}`)
    } else {
      console.error(`\n[update] ${update.sessionUpdate}`)
    }
  },
  onServerRequest: async (method, params) => {
    console.error(`[spike] server asks: ${method}`)
    if (method === 'session/request_permission') {
      const request = params as unknown as {
        toolCall?: { title?: string; name?: string }
        options: { optionId: string; kind: string }[]
      }
      const title = request.toolCall?.title ?? request.toolCall?.name ?? 'a tool'
      const reject = request.options.find((option) => option.kind.startsWith('reject'))
      console.error(`[spike] denying ${title.slice(0, 120)}`)
      if (reject) return { outcome: { outcome: 'selected', optionId: reject.optionId } }
      return { outcome: { outcome: 'cancelled' } }
    }
    return null
  },
  onUnknown: (message) => console.error(`[spike] other frame: ${JSON.stringify(message).slice(0, 300)}`),
  onStderr: (line) => console.error(`[opencode] ${line}`),
})
console.error(`[spike] agent: ${agentName}`)
console.error(`[spike] session ${sessionId}`)

const result = (await acp.request(
  'session/prompt',
  { sessionId, prompt: [{ type: 'text', text: promptText }] },
  300_000,
)) as { stopReason?: string; usage?: unknown }
process.stdout.write('\n')
console.error(`[spike] stop: ${result.stopReason ?? 'done'} usage: ${JSON.stringify(result.usage ?? null)}`)
console.error(`[spike] streamed ${streamed.length} chars`)
close()
process.exit(0)
