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

  test('moves by the header and docks back on double-click', async () => {
    render(<IconsPopover onInsert={() => undefined} onClose={() => undefined} />)
    await screen.findByRole('button', { name: 'RuneIcons' }, { timeout: 15000 })
    const dialog = screen.getByRole('dialog', { name: 'Icons' })
    expect(dialog.style.left).toBe('')
    const header = screen.getByTitle('Drag to move · double-click to dock')
    fireEvent.pointerDown(header, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 150 })
    fireEvent.pointerUp(window)
    expect(dialog.style.left).toBe('164px')
    expect(dialog.style.top).toBe('62px')
    fireEvent.doubleClick(header)
    expect(dialog.style.left).toBe('')
  })
})
