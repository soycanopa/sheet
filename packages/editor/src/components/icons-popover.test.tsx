import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IconsPopover } from './icons-popover'

describe('IconsPopover', () => {
  afterEach(() => cleanup())

  test('opens with collections and closes from its control', async () => {
    const onClose = vi.fn()
    render(<IconsPopover onInsert={() => undefined} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Icons' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Icon collection' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'RuneIcons' }, { timeout: 15000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close icons' }))
    expect(onClose).toHaveBeenCalled()
  })

  test('shows the rune style picker once RuneIcons is picked', async () => {
    render(<IconsPopover onInsert={() => undefined} onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'RuneIcons' }, { timeout: 15000 }))
    expect(screen.getByRole('group', { name: 'RuneIcons style' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pixel' })).toBeTruthy()
  })

  test('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<IconsPopover onInsert={() => undefined} onClose={onClose} />)
    await screen.findByRole('button', { name: 'RuneIcons' }, { timeout: 15000 })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
