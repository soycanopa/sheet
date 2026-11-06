import { XIcon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import { ChatPanel } from './chat-panel'

/**
 * The chat as a floating card over the canvas, in the shape of Fountible's
 * Bro panel: anchored to the lower-left canvas corner, raised surface,
 * header with a close control, the same thread as the docked panel.
 */
export function ChatFloating({
  designId,
  onClose,
  className,
}: {
  designId: string
  onClose: () => void
  className?: string
}) {
  return (
    <div
      data-chat-floating="true"
      className={cn(
        'pointer-events-auto absolute bottom-3 left-3 z-30 flex h-[480px] max-h-[calc(100%-1.5rem)] w-[380px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-foreground shadow-panel-lg',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium">Chat</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          title="Close chat"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <ChatPanel designId={designId} className="min-h-0 flex-1" />
    </div>
  )
}
