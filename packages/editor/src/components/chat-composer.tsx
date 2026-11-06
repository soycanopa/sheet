import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, SearchIcon, StarIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { OpenCodeLogo } from './agent-logos'

export interface ComposerModel {
  value: string
  name: string
  source: string
}

export interface EffortLevel {
  value: string
  label: string
}

/**
 * Tabs of the model popup. Every model answers through OpenCode today, so the
 * first tab holds the whole catalog and Favorites pins the ones in use; later
 * providers arrive as more entries here, not as a new popup.
 */
export const MODEL_TABS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'favorites', label: 'Favorites' },
] as const

export type ModelTab = (typeof MODEL_TABS)[number]['id']

const FAVORITE_MODELS_KEY = 'sheet:favorite-models'

function loadFavoriteModels(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FAVORITE_MODELS_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}

/** Every model answers through OpenCode: one mark for the whole list. */
function modelLogo(): React.ReactNode {
  return <OpenCodeLogo className="size-4 shrink-0" />
}

/**
 * The chat composer, in the shape of Fountible's input: the question on top
 * with the send button, the model and effort pills underneath, and a model
 * popup with tabs (OpenCode, Favorites) over short names with the provider
 * underneath.
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
  const [tab, setTab] = useState<ModelTab>('opencode')
  const [favorites, setFavorites] = useState<Set<string>>(loadFavoriteModels)
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

  const toggleFavorite = (value: string) => {
    setFavorites((previous) => {
      const next = new Set(previous)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      try {
        window.localStorage.setItem(FAVORITE_MODELS_KEY, JSON.stringify([...next]))
      } catch {
        // A blocked store never breaks the picker.
      }
      return next
    })
  }

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return models.filter((entry) => {
      if (tab === 'favorites' && !favorites.has(entry.value)) return false
      if (!text) return true
      return (
        entry.name.toLowerCase().includes(text) ||
        entry.source.toLowerCase().includes(text) ||
        entry.value.toLowerCase().includes(text)
      )
    })
  }, [models, query, tab, favorites])

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
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1" role="tablist" aria-label="Model sources">
            {MODEL_TABS.map((entry) => {
              const selected = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto py-1" role="listbox" aria-label="Models">
            {visible.map((entry) => {
              const selected = entry.value === model
              const starred = favorites.has(entry.value)
              return (
                <div
                  key={entry.value}
                  role="option"
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => {
                    onModel(entry.value)
                    setOpen(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onModel(entry.value)
                      setOpen(null)
                    }
                  }}
                  className="flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:bg-secondary"
                >
                  {modelLogo()}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{entry.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{entry.source}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={starred ? `Unstar ${entry.name}` : `Star ${entry.name}`}
                    aria-pressed={starred}
                    title={starred ? 'Remove from Favorites' : 'Add to Favorites'}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleFavorite(entry.value)
                    }}
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-md outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring',
                      starred ? 'text-cx-accent' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <StarIcon className={cn('size-3.5', starred && 'fill-current')} />
                  </button>
                  {selected ? <CheckIcon className="size-3.5 shrink-0 text-foreground" /> : null}
                </div>
              )
            })}
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                {tab === 'favorites' && !query.trim()
                  ? 'No favorites yet. Star a model to pin it here.'
                  : 'No models match.'}
              </p>
            ) : null}
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
            {modelLogo()}
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
