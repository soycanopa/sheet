import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PanelTabs } from './panel-tabs'

const ICON = (
  <svg aria-hidden="true" data-testid="tab-icon">
    <circle cx="8" cy="8" r="8" />
  </svg>
)

describe('PanelTabs', () => {
  afterEach(() => cleanup())

  test('names every tab when none carries an icon', () => {
    render(
      <PanelTabs
        label="Left panel"
        value="layers"
        onChange={() => undefined}
        options={[
          { value: 'layers', label: 'Layers' },
          { value: 'assets', label: 'Assets' },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Layers' }).textContent).toMatch('Layers')
    expect(screen.getByRole('tab', { name: 'Assets' }).textContent).toMatch('Assets')
  })

  test('shows icon plus name in use and icon alone at rest', () => {
    const onChange = vi.fn()
    render(
      <PanelTabs
        label="Left panel"
        value="layers"
        onChange={onChange}
        options={[
          { value: 'layers', label: 'Layers', icon: ICON },
          { value: 'assets', label: 'Assets', icon: ICON },
        ]}
      />,
    )
    const active = screen.getByRole('tab', { name: 'Layers' })
    expect(active.textContent).toMatch('Layers')
    expect(active.querySelector('[data-testid="tab-icon"]')).toBeTruthy()
    // The inactive tab keeps its accessible name but renders no label text.
    const idle = screen.getByRole('tab', { name: 'Assets' })
    expect(idle.textContent).not.toMatch('Assets')
    expect(idle.querySelector('[data-testid="tab-icon"]')).toBeTruthy()
    fireEvent.click(idle)
    expect(onChange).toHaveBeenCalledWith('assets')
  })

  test('moves between tabs with the arrow keys', () => {
    const onChange = vi.fn()
    render(
      <PanelTabs
        label="Left panel"
        value="layers"
        onChange={onChange}
        options={[
          { value: 'layers', label: 'Layers', icon: ICON },
          { value: 'assets', label: 'Assets', icon: ICON },
        ]}
      />,
    )
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('assets')
  })
})
