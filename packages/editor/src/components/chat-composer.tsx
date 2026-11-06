import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, SearchIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import {
  AntigravityLogo,
  ClaudeCodeLogo,
  CodexLogo,
  CursorLogo,
  GithubCopilotLogo,
  OpenCodeLogo,
} from './agent-logos'

export interface ComposerModel {
  value: string
  name: string
  source: string
}

export interface EffortLevel {
  value: string
  label: string
}

function providerLogo(source: string, value: string): React.ReactNode {
  const id = value.split('/')[0] ?? ''
  const className = 'size-4 shrink-0'
  switch (id) {
    case 'opencode':
      return <OpenCodeLogo className={className} />
    case 'cursor':
      return <CursorLogo className={className} />
    case 'antigravity':
      return <AntigravityLogo className={className} />
    case 'github-copilot':
      return <GithubCopilotLogo className={className} />
    case 'anthropic':
      return <ClaudeCodeLogo className={className} />
    case 'codex':
      return <CodexLogo className={className} />
    default:
      return (
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center rounded bg-secondary text-[10px] font-medium text-muted-foreground"
        >
          {(source || id || '?')[0]!.toUpperCase()}
        </span>
      )
  }
}

/**
 * The chat composer, in the shape of Fountible's input: the question on top
 * with the send button, the model and effort pills underneath, and a model
 * popup with providers on the left rail and short names on the right.
 */
export function ChatComposer({
  models,
  model,
  onModel,
  efforts,
  effort,
  onEffort,
  onSend,
  busy,
  onStop,
}: {
  models: ComposerModel[]
  model: string | null
  onModel: (value: string | null) => void
  efforts: EffortLevel[]
  effort: string
  onEffort: (value: string) => void
  onSend: (text: string) => void
  busy: boolean
  onStop: () => void
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState<'models' | 'effort' | null>(null)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = models.find((entry) => entry.value === model) ?? null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open ])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open ])

  const providers = useMemo(() => {
    const seen = new Map<string, { source: string; sample: string }>()
    for (const entry of models) {
      const id = entry.value.split('/')[0] ?? ''
      if (!seen.has(id)) seen.set(id, { source: entry.source, sample: entry.value })
    }
    return [...seen.entries()]
  }, [models])
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const provider = activeProvider ?? current?.value.split('/')[0] ?? providers[0]?.[0] ?? null
  const visible = models.filter((entry) => {
    if (provider && (entry.value.split('/')[0] ?? '') !== provider) return false
    const text = query.trim().toLowerCase()
    if (!text) return true
    return entry.name.toLowerCase().includes(text) || entry.value.toLowerCase().includes(text)
  })

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
  }

  const connectAnother = () => {
    void navigator.clipboard?.writeText('opencode auth login').catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div ref={rootRef} className="relative shrink-0 px-3 pb-3">
      {open === 'models' ? (
        <div className="absolute inset-x-3 bottom-full z-50 mb-2 flex max-h-72 flex-col overflow-hidden rounded-xl border border-line bg-popover text-foreground shadow-panel-lg">
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              aria-label="Search models"
              value={query}
              placeholder="Search models…"
              onChange={(event) => setQuery(event.target.value)}
              className="h-6 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex min-h-0 flex-1">
            <div aria-label="Providers" className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-e border-line py-2">
              {providers.map(([id, info]) => (
                <button
                  key={id}
                  type="button"
                  title={info.source}
                  aria-label={info.source}
                  aria-pressed={(provider ?? '') === id}
                  onClick={() => setActiveProvider(id)}
                  className={cn(
                    'grid size-8 place-items-center rounded-md outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring',
                    (provider ?? '') === id ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {providerLogo(info.source, info.sample)}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto py-1" role="listbox" aria-label="Models">
              {visible.map((entry) => {
                const selected = entry.value === model
                return (
                  <button
                    key={entry.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onModel(entry.value)
                      setOpen(null)
                    }}
                    className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:bg-secondary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">{entry.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{entry.source}</span>
                    </span>
                    {selected ? <CheckIcon className="size-3.5 shrink-0 text-foreground" /> : null}
                  </button>
                )
              })}
              {visible.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No models match.</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={connectAnother}
            className="shrink-0 border-t border-line px-3 py-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
          >
            {copied ? 'Copied — run it in your terminal' : 'Connect another AI'}
          </button>
          <span className="sr-only">Run opencode auth login to sign in</span>
        </div>
      ) : null}
      {open === 'effort' ? (
        <div className="absolute inset-x-3 bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-line bg-popover text-foreground shadow-panel-lg">
          <div className="flex max-h-60 flex-col overflow-y-auto py-1" role="listbox" aria-label="Effort">
            {efforts.map((level) => {
              const selected = level.value === effort
              return (
                <button
                  key={level.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onEffort(level.value)
                    setOpen(null)
                  }}
                  className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:bg-secondary"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{level.label}</span>
                  {selected ? <CheckIcon className="size-3.5 shrink-0 text-foreground" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-line bg-surface-2">
        <div className="flex items-start gap-2 px-3 pt-2.5">
          <input
            aria-label="Message"
            value={draft}
            placeholder="Ask Duma…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              title="Stop"
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="size-2.5 rounded-[3px] bg-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send"
              title="Send"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-cx-accent text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <ArrowUpIcon className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(open === 'models' ? null : 'models')}
            aria-label="Model"
            aria-expanded={open === 'models'}
            className={cn(
              'flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring',
              open === 'models' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {current ? providerLogo(current.source, current.value) : <OpenCodeLogo className="size-4 shrink-0" />}
            <span className="max-w-28 truncate font-medium">{current ? current.name : 'Default model'}</span>
            <ChevronDownIcon className="size-3 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === 'effort' ? null : 'effort')}
            aria-label="Effort"
            aria-expanded={open === 'effort'}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring',
              open === 'effort' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="font-medium">{efforts.find((level) => level.value === effort)?.label ?? effort}</span>
            <ChevronDownIcon className="size-3 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )
}
