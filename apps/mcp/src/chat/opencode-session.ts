import { accessSync, constants, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { AcpConnection, type SessionUpdate, type SpawnedProcess } from './acp-client'
import { MIN_MAJOR, findOpenCodeAppCli, openCodeEnv, parseVersion, standaloneCandidates } from './opencode-locate'

function isExecutableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function cliVersion(cli: string): Promise<[number, number, number] | null> {
  const proc = Bun.spawn([cli, '--version'], { stdout: 'pipe', stderr: 'ignore', timeout: 15_000 })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return parseVersion(text)
}

export async function locateCli(log: (line: string) => void): Promise<string | null> {
  const home = homedir()
  const appCli = findOpenCodeAppCli(home, {
    readdir: (dir) => readdirSync(dir),
    isExecutableFile,
  })
  const candidates = [...standaloneCandidates(home), ...(appCli ? [appCli] : [])]
  for (const candidate of candidates) {
    if (!isExecutableFile(candidate)) continue
    const version = await cliVersion(candidate)
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
  close: () => void
}

/**
 * Spawn `opencode acp` in a private config dir and open one ACP session.
 * Auth still resolves: `opencode auth` sign-ins live outside the config dir,
 * so the user's logins work while Sheet's lockdown never touches their files.
 */
export async function startSession(opts: {
  cli: string
  mcpServers: AcpMcpServer[]
  onUpdate: (sessionId: string, update: SessionUpdate) => void
  onServerRequest: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown>
  onUnknown?: (message: Record<string, unknown>) => void
  onStderr?: (line: string) => void
}): Promise<StartedSession> {
  const home = homedir()
  const runDir = join(tmpdir(), `sheet-chat-${crypto.randomUUID()}`)
  mkdirSync(runDir, { recursive: true })
  const configDir = join(runDir, 'opencode-config')
  mkdirSync(configDir, { recursive: true })

  const child = Bun.spawn([opts.cli, 'acp'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: runDir,
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

  const session = (await acp.request('session/new', { cwd: runDir, mcpServers: opts.mcpServers })) as {
    sessionId?: string
  }
  if (!session.sessionId) throw new Error(`session/new answered without a sessionId: ${JSON.stringify(session).slice(0, 200)}`)

  return {
    acp,
    sessionId: session.sessionId,
    agentName: `${init.agentInfo?.name ?? 'opencode'} ${init.agentInfo?.version ?? ''}`.trim(),
    close: () => acp.close(),
  }
}
