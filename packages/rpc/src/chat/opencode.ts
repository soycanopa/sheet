/**
 * What Sheet writes into OpenCode's private config dir: a canvas-only agent,
 * on by default for nothing but our MCP tools. Mirrors the shape Fountible
 * uses for its own agent host (custom primary agent + `default_agent`), in
 * OpenCode 2's config format.
 *
 * - Agent-level `permissions`: everything asks, `sheet_*` (our MCP server)
 *   is allowed. Asks arrive over ACP as `session/request_permission`, where
 *   the manager allows the read-only canvas tools and denies the rest.
 * - `share: disabled`, `snapshots: false`, `update: disable`: chats stay on
 *   this machine and never touch the user's own OpenCode setup.
 */

export const SHEET_CHAT_AGENT = 'sheet'

/** Sheet MCP tools with no write path. Everything else is denied for now. */
export const CHAT_READ_ONLY_TOOLS = new Set([
  'getUsage',
  'listDesigns',
  'getWebDocument',
  'getWebHTML',
  'getWebCSS',
  'getWebScreenshot',
  'exportDesign',
  'listBranches',
  'compareBranch',
  'listVersions',
  'searchIcons',
  'listPages',
  'listFramePresets',
  'listShaders',
  'listComments',
  'listAssets',
])

/** MCP tool calls arrive namespaced; match on the trailing tool name. */
export function chatToolTail(name: string): string {
  return name.split(/[:_]+/).filter(Boolean).pop() ?? name
}

export function isChatReadOnlyTool(name: string): boolean {
  return CHAT_READ_ONLY_TOOLS.has(chatToolTail(name))
}

const SHEET_HOST_GUIDANCE = `You are Sheet's design agent, chatting inside the Sheet canvas editor. Your full instructions for this chat are in AGENTS.md.

## Your tools in Sheet
Only the canvas tools work here: sheet_*, the MCP tools of the Sheet server. Shell commands, file reads and writes, web fetching and searching, subagents, todos, questions and every other tool are turned off: asking for one ends the turn denied, so never call them. When you need something from the user, ask it in plain text in your reply. Writes outside the read-only tools are denied for now; read first, describe what you would change, and never claim a change you did not make.

## What the user sees
Everything you write outside tool calls appears in the chat as your message, word for word. Before a tool call, write one short, calm line about what you're about to do, or nothing. Think silently: your reply is not a scratchpad. The user can't see your tool results or your working files, so don't point them at file names. When you're done, say plainly what changed and anything left for them to decide.

## Reading before you act
Read what the task needs, then act. What you have read stays in your history: read a design again only when it may have changed. Once you know enough, act and check the result.`

export function sheetChatConfig(): Record<string, unknown> {
  return {
    agents: {
      [SHEET_CHAT_AGENT]: {
        mode: 'primary',
        description: "Sheet's design agent",
        system: SHEET_HOST_GUIDANCE,
        permissions: [
          { action: '*', resource: '*', effect: 'ask' },
          { action: 'sheet_*', resource: '*', effect: 'allow' },
        ],
      },
    },
    default_agent: SHEET_CHAT_AGENT,
    share: 'disabled',
    snapshots: false,
    update: 'disable',
  }
}

/** The chat's working instructions, written as the workspace AGENTS.md. */
export function sheetWorkspaceInstructions(designId: string): string {
  return `${SHEET_HOST_GUIDANCE}\n\n## This chat\nYou are working with the Sheet design \`${designId}\`. List its pages and frames before assuming anything about it.\n`
}

/** Effort levels the panel offers, copied from Fountible's thinking scale. */
export const CHAT_EFFORT_LEVELS = [
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra' },
  { value: 'max', label: 'Max' },
] as const

export type ChatEffort = (typeof CHAT_EFFORT_LEVELS)[number]['value']

/** Map a panel effort level onto OpenCode's effort values, first match wins. */
export function chatEffortCandidates(level: string): string[] {
  switch (level) {
    case 'off':
    case 'low':
      return ['low', 'minimal']
    case 'medium':
      return ['medium']
    case 'high':
      return ['high']
    case 'xhigh':
    case 'max':
    case 'ultra':
      return ['xhigh', 'max', 'high']
    default:
      return []
  }
}

/** OpenCode provider ids, named the way people know them. */
const SOURCE_NAMES: Record<string, string> = {
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  'github-copilot': 'GitHub Copilot',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'google-vertex': 'Google Vertex AI',
  openrouter: 'OpenRouter',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  groq: 'Groq',
  'amazon-bedrock': 'Amazon Bedrock',
  azure: 'Azure',
  moonshotai: 'Moonshot AI',
  zai: 'Z.ai',
  'zai-coding-plan': 'Z.ai Coding Plan',
  fireworks: 'Fireworks',
  together: 'Together AI',
  cerebras: 'Cerebras',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  vercel: 'Vercel AI Gateway',
}

export function chatSourceName(providerId: string): string {
  if (SOURCE_NAMES[providerId]) return SOURCE_NAMES[providerId]!
  return providerId
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

export interface ChatModelEntry {
  id: string
  name: string
  source: string
}

/**
 * Pure: the runnable models (`opencode models`, one `provider/model` per
 * line) named from the catalog (`opencode api model.list`).
 */
export function summarizeChatModels(modelsText: string, catalogJson: string): ChatModelEntry[] {
  const names = new Map<string, string>()
  try {
    const catalog = JSON.parse(catalogJson) as {
      data?: { providerID?: unknown; id?: unknown; name?: unknown }[]
    }
    for (const model of Array.isArray(catalog?.data) ? catalog.data! : []) {
      if (typeof model?.providerID === 'string' && typeof model?.id === 'string' && typeof model?.name === 'string') {
        names.set(`${model.providerID}/${model.id}`, model.name)
      }
    }
  } catch {
    // Unnamed models fall back to their ids below.
  }
  const models: ChatModelEntry[] = []
  for (const raw of modelsText.split('\n')) {
    const id = raw.trim()
    const slash = id.indexOf('/')
    if (slash <= 0 || slash === id.length - 1 || /\s/.test(id)) continue
    const providerId = id.slice(0, slash)
    models.push({ id, name: names.get(id) ?? id.slice(slash + 1), source: chatSourceName(providerId) })
  }
  return models
}
