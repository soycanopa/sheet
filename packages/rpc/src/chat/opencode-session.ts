import { accessSync, constants, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { AcpConnection, type SessionUpdate, type SpawnedProcess } from './acp-client'
import { MIN_MAJOR, findOpenCodeAppCli, openCodeEnv, parseVersion, standaloneCandidates } from './opencode-locate'
import { sheetChatConfig, sheetWorkspaceInstructions } from './opencode'

function isExecutableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function openCodeCliVersion(cli: string): Promise<[number, number, number] | null> {
  const proc = Bun.spawn([cli, '--version'], { stdout: 'pipe', stderr: 'ignore', timeout: 15_000 })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return parseVersion(text)
}

export async function locateOpenCodeCli(log: (line: string) => void): Promise<string | null> {
  const home = homedir()
  const appCli = findOpenCodeAppCli(home, {
    readdir: (dir) => readdirSync(dir),
    isExecutableFile,
  })
  const candidates = [...standaloneCandidates(home), ...(appCli ? [appCli] : [])]
  for (const candidate of candidates) {
    if (!isExecutableFile(candidate)) continue
    const version = await openCodeCliVersion(candidate)
    if (version && (version[0] ?? 0) >= MIN_MAJOR) {
      log(`using ${candidate} v${version.join('.')}`)
      return candidate
    }
    if (version) log(`ignoring ${candidate} (v${version.join('.')}, need >= ${MIN_MAJOR})`)
  }
  return null
}

export interface AcpMcpServer {
  type: 'http'
  name: string
  url: string
  headers: { name: string; value: string }[]
}

export interface StartedSession {
  acp: AcpConnection
  sessionId: string
  agentName: string
  configOptions: unknown[]
  dir: string
  close: () => void
}

/**
 * Spawn `opencode acp` in a private runtime dir and open one ACP session.
 *
 * The dir holds the lockdown `opencode.json` (canvas-only agent, nothing
 * shared) and a per-chat workspace whose AGENTS.md carries the working
 * instructions — the same layout Fountible's agent host uses. Auth still
 * resolves: `opencode auth` sign-ins live outside the config dir, so the
 * user's logins work while Sheet never touches their files.
 */
export async function startOpenCodeSession(opts: {
  cli: string
  designId: string
  mcpServers: AcpMcpServer[]
  onUpdate: (sessionId: string, update: SessionUpdate) => void
  onServerRequest: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>
  onUnknown?: (message: Record<string, unknown>) => void
  onStderr?: (line: string) => void
}): Promise<StartedSession> {
  const home = homedir()
  const runDir = join(tmpdir(), `sheet-chat-${crypto.randomUUID()}`)
  const configDir = join(runDir, 'opencode-config')
  const workspaceDir = join(runDir, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'opencode.json'), `${JSON.stringify(sheetChatConfig(), null, 2)}\n`)
  writeFileSync(join(workspaceDir, 'AGENTS.md'), sheetWorkspaceInstructions(opts.designId))

  const child = Bun.spawn([opts.cli, 'acp'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: workspaceDir,
    env: openCodeEnv({ cli: opts.cli, homeDir: home, configDir, tmpDir: runDir }),
  })
  void (async () => {
    const reader = (child.stderr as ReadableStream).getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const line = decoder.decode(value).trim()
      if (line) opts.onStderr?.(line.slice(0, 300))
    }
  })().catch(() => undefined)

  const proc: SpawnedProcess = {
    stdin: {
      write: (chunk) => (child.stdin as unknown as { write: (c: string) => void }).write(chunk),
      flush: () => (child.stdin as unknown as { flush?: () => void }).flush?.(),
    },
    stdout: child.stdout as ReadableStream<Uint8Array>,
    kill: () => child.kill(),
  }

  const acp = new AcpConnection(proc)
  acp.onUpdate = opts.onUpdate
  acp.handleServerRequest = opts.onServerRequest
  if (opts.onUnknown) acp.onUnknown = opts.onUnknown

  const init = (await acp.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  })) as { agentInfo?: { name?: string; version?: string } }

  const session = (await acp.request('session/new', { cwd: workspaceDir, mcpServers: opts.mcpServers })) as {
    sessionId?: string
    configOptions?: unknown[]
  }
  if (!session.sessionId) throw new Error(`session/new answered without a sessionId: ${JSON.stringify(session).slice(0, 200)}`)

  return {
    acp,
    sessionId: session.sessionId,
    agentName: `${init.agentInfo?.name ?? 'opencode'} ${init.agentInfo?.version ?? ''}`.trim(),
    configOptions: Array.isArray(session.configOptions) ? session.configOptions : [],
    dir: runDir,
    close: () => acp.close(),
  }
}

/** Give OpenCode a bounded wait to list the canvas tools before the prompt. */
export function waitForListedTools(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 8_000)
    timer.unref?.()
  })
}
