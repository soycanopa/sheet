import { useEffect, useState } from 'react'
import { orpc } from '@sheet/rpc/client'
import { OpenCodeLogo } from '@sheet/editor/agent-logos'
import { Switch } from '@sheet/ui/switch'
import { cn } from '@sheet/ui/utils'
import { Section, Segmented } from './appearance-settings'

type ChatSide = 'left' | 'right'
type ChatMode = 'panel' | 'floating'

/**
 * The internal chat's master switch, plus where it lives. Off until the
 * person says otherwise: while it is off nothing runs and no agent process
 * spawns. Answers come from this Mac's OpenCode sign-ins — Sheet never signs
 * in or out of them.
 */
export function InternalChatSettings() {
  const [enabled, setEnabled] = useState(false)
  const [side, setSide] = useState<ChatSide>('left')
  const [mode, setMode] = useState<ChatMode>('panel')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void orpc.preferences
      .get()
      .then((preferences) => {
        if (cancelled) return
        setEnabled(preferences.chat.enabled)
        setSide(preferences.chat.side)
        setMode(preferences.chat.mode)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const save = (next: { enabled: boolean; side: ChatSide; mode: ChatMode }) => {
    const previous = { enabled, side, mode }
    setEnabled(next.enabled)
    setSide(next.side)
    setMode(next.mode)
    setFailed(false)
    void orpc.preferences
      .save({ chat: { enabled: next.enabled, provider: 'opencode', side: next.side, mode: next.mode } })
      .then((preferences) => {
        setEnabled(preferences.chat.enabled)
        setSide(preferences.chat.side)
        setMode(preferences.chat.mode)
      })
      .catch(() => {
        setEnabled(previous.enabled)
        setSide(previous.side)
        setMode(previous.mode)
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
        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">Takes effect immediately.</p>
        <Switch
          aria-label="Internal chat"
          checked={enabled}
          onCheckedChange={(next) => save({ enabled: next, side, mode })}
          className="shrink-0"
        />
      </div>
      <div className="border-t border-line pt-4">
        <h4 className="text-xs font-medium text-foreground">Providers</h4>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="flex items-center gap-3">
            <OpenCodeLogo className="size-4" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">OpenCode</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Answers with the models you signed in to in OpenCode.
              </p>
            </div>
          </li>
        </ul>
      </div>
      <div className="border-t border-line pt-4">
        <h4 className="text-xs font-medium text-foreground">Panel side</h4>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Which edge the chat panel docks to.</p>
        <div className="mt-2">
          <Segmented
            label="Panel side"
            value={side}
            options={(['left', 'right'] as const).map((option) => ({
              value: option,
              content: <span className="text-xs">{option === 'left' ? 'Left' : 'Right'}</span>,
            }))}
            onChange={(next) => save({ enabled, side: next, mode })}
          />
        </div>
      </div>
      <div className="border-t border-line pt-4">
        <h4 className="text-xs font-medium text-foreground">Show as</h4>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Docked in the side panel, or floating over the canvas.
        </p>
        <div className="mt-2">
          <Segmented
            label="Show as"
            value={mode}
            options={(['panel', 'floating'] as const).map((option) => ({
              value: option,
              content: <span className="text-xs">{option === 'panel' ? 'Panel' : 'Floating'}</span>,
            }))}
            onChange={(next) => save({ enabled, side, mode: next })}
          />
        </div>
      </div>
      {failed ? (
        <p role="alert" className={cn('text-xs leading-relaxed text-destructive-foreground')}>
          The change did not stick — the local server could not be reached. Nothing changed.
        </p>
      ) : null}
    </Section>
  )
}
