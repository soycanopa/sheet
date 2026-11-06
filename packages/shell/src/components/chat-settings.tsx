import { useEffect, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import { Switch } from '@sheet/ui/switch'
import { cn } from '@sheet/ui/utils'
import { Section } from './appearance-settings'

/**
 * The internal chat's master switch. Off until the person says otherwise:
 * while it is off nothing runs and no agent process spawns. Answers come
 * from this Mac's OpenCode sign-ins — Sheet never signs in or out of them.
 */
export function InternalChatSettings() {
  const [enabled, setEnabled] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void orpc.preferences
      .get()
      .then((preferences) => {
        if (cancelled) return
        setEnabled(preferences.chat.enabled)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const flip = (next: boolean) => {
    const previous = enabled
    setEnabled(next)
    setFailed(false)
    void orpc.preferences
      .save({ chat: { enabled: next, provider: 'opencode' } })
      .then((preferences) => setEnabled(preferences.chat.enabled))
      .catch(() => {
        setEnabled(previous)
        setFailed(true)
      })
  }

  return (
    <Section
      label="Internal chat"
      hint="Work the canvas with an agent that runs here, on this Mac, through your OpenCode models. It reads your sign-ins and never touches them."
      value={enabled ? 'On' : 'Off'}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Chat with OpenCode</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">The only provider for now.</p>
        </div>
        <Switch aria-label="Internal chat" checked={enabled} onCheckedChange={flip} className="shrink-0" />
      </div>
      {failed ? (
        <p role="alert" className={cn('text-xs leading-relaxed text-destructive-foreground')}>
          The switch did not stick — the local server could not be reached. Nothing changed.
        </p>
      ) : null}
    </Section>
  )
}
