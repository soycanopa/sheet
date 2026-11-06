import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { XIcon } from '@sheet/ui/icons'
import { IconsPanel, type IconPick } from './icon-panel'

/**
 * The floating icon picker: the toolbar's Icons tool opens it beside the
 * bar, with the collection picker on top and a grid below. Clicking a tile
 * inserts it; dragging a tile onto the canvas drops it at that point.
 */
export function IconsPopover({
  onInsert,
  onClose,
}: {
  onInsert: (icon: IconPick) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Drag offset from the anchored spot (beside the toolbar); null parks it
  // back. Double-click the header to re-anchor.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const atRef = useRef(at)
  atRef.current = at

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        if ((event.target as Element)?.closest?.('[aria-label="Icon library"]')) return
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as Element)?.closest?.('button')) return
    event.preventDefault()
    const origin = { x: event.clientX, y: event.clientY, at: atRef.current ?? { x: 0, y: 0 } }
    const onMove = (move: PointerEvent) => {
      // Never park it off the stage: 8px of the anchor margin stays visible.
      setAt({
        x: Math.max(-56, origin.at.x + move.clientX - origin.x),
        y: Math.max(-4, origin.at.y + move.clientY - origin.y),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={rootRef}
      data-icon-popover="true"
      role="dialog"
      aria-label="Icons"
      style={at ? { left: 64 + at.x, top: 12 + at.y } : undefined}
      className="absolute left-16 top-3 z-30 flex h-[480px] max-h-[calc(100%-1.5rem)] w-80 max-w-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-foreground shadow-panel-lg"
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={() => setAt(null)}
        title="Drag to move · double-click to dock"
        className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing"
      >
        <p className="min-w-0 flex-1 truncate text-xs font-medium">Icons</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close icons"
          title="Close icons"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <p className="shrink-0 px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Pick a collection, then click to insert or drag onto the canvas.
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        <IconsPanel onInsert={onInsert} />
      </div>
    </div>
  )
}
