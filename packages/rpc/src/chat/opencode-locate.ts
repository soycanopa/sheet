import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Finding an OpenCode 2 CLI on this machine.
 *
 * Mirrors what the agent host in Fountible does: OpenCode 2 arrives as
 * `opencode2` (npm `@opencode/cli`), as `opencode` on newer installs, or as
 * the OpenCode desktop app's own copy, which it keeps out of PATH at
 * `~/Library/Application Support/ai.opencode.desktop/cli/<version>-<arch>/opencode-cli`.
 * Only 2.x is usable — the lockdown config below is written in the 2.x
 * format, which 1.x ignores (and would then run with every tool on).
 *
 * Sign-ins are OpenCode's own (`opencode auth`), shared with its app and CLI.
 * Sheet reads them and never signs in or out.
 */

export const MIN_MAJOR = 2

const VERSION_RE = /(\d+)\.(\d+)\.(\d+)/
const ARCH_SUFFIX_RE = /-(arm64|aarch64|x64|x86_64)$/

export type ParsedVersion = [number, number, number]

export function parseVersion(text: string | null | undefined): ParsedVersion | null {
  const match = VERSION_RE.exec(String(text ?? ''))
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** The OpenCode desktop app's CLI folder. Only the macOS app keeps one here. */
export function openCodeAppCliRoot(homeDir: string = homedir()): string {
  return join(homeDir, 'Library', 'Application Support', 'ai.opencode.desktop', 'cli')
}

export interface FsProbe {
  readdir(dir: string): string[]
  isExecutableFile(file: string): boolean
}

/** The OpenCode app's newest CLI copy, or null. Re-check before each use. */
export function findOpenCodeAppCli(homeDir: string, fs: FsProbe): string | null {
  let entries: string[]
  try {
    entries = fs.readdir(openCodeAppCliRoot(homeDir))
  } catch {
    return null
  }
  const builds = entries
    .map((name) => ({ name, version: parseVersion(name.replace(ARCH_SUFFIX_RE, '')) }))
    .filter((entry): entry is { name: string; version: ParsedVersion } => entry.version !== null)
    .sort((a, b) => compareVersions(b.version, a.version))
  for (const build of builds) {
    const bin = join(openCodeAppCliRoot(homeDir), build.name, 'opencode-cli')
    if (fs.isExecutableFile(bin)) return bin
  }
  return null
}

/** Where a standalone OpenCode might live, in the order to try. */
export function standaloneCandidates(homeDir: string = homedir()): string[] {
  const dirs = [
    join(homeDir, '.opencode', 'bin'),
    join(homeDir, '.local', 'bin'),
    join(homeDir, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  return ['opencode2', 'opencode'].flatMap((name) => dirs.map((dir) => join(dir, name)))
}

/**
 * The bare environment the chat gives OpenCode: a narrow PATH, its own
 * config dir (so Sheet's lockdown never touches the user's opencode.json),
 * and no Claude Code provider. Auth still resolves because `opencode auth`
 * sign-ins live outside the config dir.
 */
export function openCodeEnv(opts: {
  cli: string
  homeDir: string
  configDir: string
  tmpDir: string
  extra?: Record<string, string>
}): Record<string, string> {
  return {
    PATH: [dirname(opts.cli), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    HOME: opts.homeDir,
    TMPDIR: opts.tmpDir,
    LANG: 'en_US.UTF-8',
    OPENCODE_CONFIG_DIR: opts.configDir,
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    ...opts.extra,
  }
}
