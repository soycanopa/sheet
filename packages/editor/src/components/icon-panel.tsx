import { createElement, useEffect, useMemo, useState } from 'react'
import { cn } from '@sheet/ui/utils'
import { RUNE_STYLES, type IconLibrary, type RuneIconStyle } from '@sheet/canvas/web-icons'

type IconModule = typeof import('@sheet/canvas/web-icons')

type ShapeNode = { tag: string; attrs: Record<string, string>; children: ShapeNode[] }

const LIMIT = 120
const DEFAULT_RUNE_STYLE: RuneIconStyle = 'outline'
const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** Payload for dropping a tile on the canvas: the editor inserts it at the drop point. */
export const SHEET_ICON_MIME = 'application/x-sheet-icon'

export interface IconPick {
  library: IconLibrary
  name: string
  style?: RuneIconStyle
}

function shapeProps(attrs: Record<string, string>): Record<string, unknown> {
  const { style, ...rest } = attrs
  const props: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest)
      .filter(([key]) => key !== 'key' && key !== 'strokeWidth' && key !== 'stroke-width')
      .map(([key, value]) => [camel(key), value]),
  )
  // React wants the style prop as an object; the mask-type on glass masks
  // rides along as a string in the source markup, so convert it per node.
  if (style) {
    props.style = Object.fromEntries(
      style
        .split(';')
        .map((chunk) => chunk.split(':').map((part) => part.trim()))
        .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== '' && pair[1] !== undefined)
        .map(([key, value]) => [camel(key), value]),
    )
  }
  return props
}

function ShapeShapes({ nodes }: { nodes: readonly ShapeNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const children = node.children.length > 0 ? <ShapeShapes nodes={node.children} /> : undefined
        return createElement(node.tag, { key: index, ...shapeProps(node.attrs) }, children)
      })}
    </>
  )
}

function IconPreview({
  icons,
  library,
  name,
  style,
}: {
  icons: IconModule
  library: IconLibrary
  name: string
  style?: RuneIconStyle
}) {
  const entry = icons.iconData(library, name, style)
  if (!entry) return null
  return (
    <svg
      viewBox={entry.viewBox}
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={library === 'lucide' ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ShapeShapes nodes={entry.data} />
    </svg>
  )
}

export function iconDragPayload(pick: IconPick): string {
  return JSON.stringify(pick)
}

export function parseIconDrag(raw: string): IconPick | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { library, name, style } = parsed as { library?: unknown; name?: unknown; style?: unknown }
    if (library !== 'hugeicons' && library !== 'lucide' && library !== 'runeicons') return null
    if (typeof name !== 'string' || !name) return null
    const pick: IconPick = { library, name }
    if (typeof style === 'string' && (RUNE_STYLES as readonly { id: string }[]).some((entry) => entry.id === style)) {
      pick.style = style as RuneIconStyle
    }
    return pick
  } catch {
    return null
  }
}

export function IconsPanel({ onInsert }: { onInsert: (icon: IconPick) => void }) {
  const [icons, setIcons] = useState<IconModule | null>(null)
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState<IconLibrary | 'all'>('all')
  const [runeStyle, setRuneStyle] = useState<RuneIconStyle>(DEFAULT_RUNE_STYLE)

  // The full sets are large; load them only when this tab is opened.
  useEffect(() => {
    let active = true
    void import('@sheet/canvas/web-icons').then((module) => {
      if (active) setIcons(module)
    })
    return () => {
      active = false
    }
  }, [])

  const results = useMemo(
    () =>
      icons?.searchIcons(query, library === 'all' ? undefined : library, LIMIT, runeStyle) ?? [],
    [icons, query, library, runeStyle],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <input
        type="search"
        aria-label="Search icons"
        placeholder="Search icons"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        className="h-8 w-full min-w-0 shrink-0 rounded-md border border-input bg-surface-2 px-2 text-xs text-foreground outline-none focus:border-ring"
      />
      <div role="group" aria-label="Icon collection" className="grid shrink-0 grid-cols-4 rounded-lg border border-line bg-well p-0.5">
        {([{ id: 'all', label: 'All' }, ...(icons?.ICON_LIBRARIES ?? [])] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={library === option.id}
            className={cn(
              'min-w-0 truncate rounded-md px-1 py-1 text-xs transition-colors',
              library === option.id
                ? 'bg-surface font-medium text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setLibrary(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {library === 'all' || library === 'runeicons' ? (
        <div role="group" aria-label="RuneIcons style" className="grid shrink-0 grid-cols-5 rounded-lg border border-line bg-well p-0.5">
          {RUNE_STYLES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={runeStyle === option.id}
              title={option.label}
              className={cn(
                'min-w-0 truncate rounded-md px-1 py-1 text-xs transition-colors',
                runeStyle === option.id
                  ? 'bg-surface font-medium text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setRuneStyle(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {!icons ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading icons…</p>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No icons match “{query}”.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
            {results.map((icon) => {
              const pick: IconPick = icon.style ? { library: icon.library, name: icon.name, style: icon.style } : { library: icon.library, name: icon.name }
              return (
                <button
                  key={`${icon.library}:${icon.name}:${icon.style ?? ''}`}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(SHEET_ICON_MIME, iconDragPayload(pick))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  aria-label={`Insert ${icon.name} icon`}
                  title={`${icon.name} · ${icon.library}${icon.style ? ` · ${icon.style}` : ''}`}
                  className="grid aspect-square cursor-grab place-items-center rounded-md border border-line text-foreground hover:border-cx-accent hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
                  onClick={() => onInsert(pick)}
                >
                  <IconPreview icons={icons} library={icon.library} name={icon.name} style={icon.style} />
                </button>
              )
            })}
          </div>
        )}
        {icons && results.length === LIMIT ? (
          <p className="pt-3 text-center text-[11px] text-muted-foreground">
            Showing the first {LIMIT}. Search to narrow down.
          </p>
        ) : null}
      </div>
    </div>
  )
}
