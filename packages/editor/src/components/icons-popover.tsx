import { useEffect, useRef } from 'react'
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

  return (
    <div
      ref={rootRef}
      data-icon-popover="true"
      role="dialog"
      aria-label="Icons"
      className="absolute left-16 top-3 z-30 flex h-[420px] max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-foreground shadow-panel-lg"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
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
