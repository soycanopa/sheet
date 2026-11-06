import { describe, expect, test } from 'vitest'
import { splitLines } from './acp-client'
import {
  compareVersions,
  findOpenCodeAppCli,
  openCodeAppCliRoot,
  openCodeEnv,
  parseVersion,
  standaloneCandidates,
} from './opencode-locate'
import {
  CHAT_EFFORT_LEVELS,
  chatEffortCandidates,
  chatSourceName,
  chatToolTail,
  isChatReadOnlyTool,
  sheetChatConfig,
  summarizeChatModels,
} from './opencode'

describe('opencode version gate', () => {
  test('parses dotted versions out of surrounding text', () => {
    expect(parseVersion('opencode v2.2.5')).toEqual([2, 2, 5])
    expect(parseVersion('2.10.0')).toEqual([2, 10, 0])
    expect(parseVersion('no version here')).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })

  test('compares numerically, not lexicographically', () => {
    expect(compareVersions([2, 2, 5], [2, 10, 0])).toBeLessThan(0)
    expect(compareVersions([2, 2, 5], [1, 99, 99])).toBeGreaterThan(0)
    expect(compareVersions([2, 2, 5], [2, 2, 5])).toBe(0)
  })
})

describe('opencode discovery', () => {
  test('prefers opencode2 over opencode in each dir', () => {
    const candidates = standaloneCandidates('/home/u')
    expect(candidates[0]).toBe('/home/u/.opencode/bin/opencode2')
    expect(candidates).toContain('/home/u/.opencode/bin/opencode')
    expect(candidates).toContain('/opt/homebrew/bin/opencode')
  })

  test('picks the newest executable app copy', () => {
    const root = openCodeAppCliRoot('/home/u')
    const executable = new Map<string, boolean>([
      [`${root}/2.2.5-arm64/opencode-cli`, true],
      [`${root}/2.1.0-arm64/opencode-cli`, true],
      [`${root}/2.9.0-arm64/opencode-cli`, false],
    ])
    const found = findOpenCodeAppCli('/home/u', {
      readdir: (dir: string) => {
        expect(dir).toBe(root)
        return ['2.1.0-arm64', '2.2.5-arm64', '2.9.0-arm64', 'notes.txt']
      },
      isExecutableFile: (file: string) => executable.get(file) ?? false,
    })
    expect(found).toBe(`${root}/2.2.5-arm64/opencode-cli`)
  })

  test('returns null when the app keeps no CLI', () => {
    const found = findOpenCodeAppCli('/home/u', {
      readdir: () => {
        throw new Error('no such dir')
      },
      isExecutableFile: () => false,
    })
    expect(found).toBeNull()
  })
})

describe('opencode environment', () => {
  test('locks PATH and isolates the config dir', () => {
    const env = openCodeEnv({ cli: '/x/bin/opencode', homeDir: '/home/u', configDir: '/tmp/cfg', tmpDir: '/tmp/run' })
    expect(env.OPENCODE_CONFIG_DIR).toBe('/tmp/cfg')
    expect(env.OPENCODE_DISABLE_CLAUDE_CODE).toBe('1')
    expect(env.PATH?.split(':')[0]).toBe('/x/bin')
    expect(env.HOME).toBe('/home/u')
  })
})

describe('acp framing', () => {
  test('splits complete lines and keeps the tail buffered', () => {
    const { lines, rest } = splitLines('{"a":1}\n{"b":', '2}\n{"c":3}')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('{"c":3}')
  })
})

describe('chat lockdown', () => {
  test('asks everything except the sheet tools', () => {
    const config = sheetChatConfig() as {
      agents: { duma: { permissions: { action: string; effect: string }[] } }
      default_agent: string
      share: string
    }
    expect(config.default_agent).toBe('duma')
    expect(config.share).toBe('disabled')
    expect(config.agents.duma.permissions).toEqual([
      { action: '*', resource: '*', effect: 'ask' },
      { action: 'sheet_*', resource: '*', effect: 'allow' },
    ])
  })

  test('matches MCP tool names on the trailing segment', () => {
    expect(chatToolTail('sheet_listDesigns')).toBe('listDesigns')
    expect(chatToolTail('mcp__sheet__getWebDocument')).toBe('getWebDocument')
    expect(isChatReadOnlyTool('sheet_listDesigns')).toBe(true)
    expect(isChatReadOnlyTool('sheet_applyWebTransaction')).toBe(false)
    expect(isChatReadOnlyTool('shell')).toBe(false)
  })
})

describe('chat effort', () => {
  test('offers the Fountible scale and maps it onto OpenCode values', () => {
    expect(CHAT_EFFORT_LEVELS.map((level) => level.value)).toEqual([
      'auto',
      'off',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
    expect(chatEffortCandidates('auto')).toEqual([])
    expect(chatEffortCandidates('low')).toEqual(['low', 'minimal'])
    expect(chatEffortCandidates('medium')).toEqual(['medium'])
    expect(chatEffortCandidates('xhigh')).toEqual(['xhigh', 'max', 'high'])
  })
})

describe('chat model catalog', () => {
  test('names runnable models from the catalog', () => {
    const models = summarizeChatModels(
      'deepseek/deepseek-flash\nnot-a-model\nxai/grok-4.5\n',
      JSON.stringify({ data: [{ providerID: 'xai', id: 'grok-4.5', name: 'Grok 4.5' }] }),
    )
    expect(models).toEqual([
      { id: 'deepseek/deepseek-flash', name: 'deepseek-flash', source: 'DeepSeek' },
      { id: 'xai/grok-4.5', name: 'Grok 4.5', source: 'xAI' },
    ])
  })

  test('falls back to ids and title-cases unknown providers', () => {
    expect(chatSourceName('deepseek')).toBe('DeepSeek')
    expect(chatSourceName('my-cloud')).toBe('My Cloud')
    expect(summarizeChatModels('oops', 'nope')).toEqual([])
  })
})
