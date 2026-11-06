import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, vi, test } from 'vitest'
import { ChatComposer } from './chat-composer'

const MODELS = [
  { value: 'xai/grok-4.7', name: 'Grok 4.7', source: 'xAI' },
  { value: 'deepseek/deepseek-flash', name: 'DeepSeek V4.1 Flash 1017', source: 'DeepSeek' },
  { value: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', source: 'DeepSeek' },
]

const EFFORTS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
]

function composer(props: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  const onSend = vi.fn()
  render(
    <ChatComposer
      models={MODELS}
      model="xai/grok-4.7"
      onModel={() => undefined}
      efforts={EFFORTS}
      effort="auto"
      onEffort={() => undefined}
      onSend={onSend}
      busy={false}
      onStop={() => undefined}
      {...props}
    />,
  )
  return { onSend }
}

describe('ChatComposer', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.removeItem('sheet:favorite-models')
  })

  test('lists every model with its short name over its provider', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    const grok = screen.getByRole('option', { name: /Grok 4\.7/ })
    expect(grok.textContent).toMatch('Grok 4.7')
    expect(grok.textContent).toMatch('xAI')
    expect(grok.textContent).not.toMatch('xai/')
    const flash = screen.getByRole('option', { name: /DeepSeek V4\.1/ })
    expect(flash.textContent).toMatch('DeepSeek')
  })

  test('filters models by name or provider', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), { target: { value: 'deep' } })
    expect(screen.queryByRole('option', { name: /Grok/ })).toBeNull()
    expect(screen.getByRole('option', { name: /V4 Pro/ })).toBeTruthy()
  })

  test('picks a model and an effort', () => {
    const onModel = vi.fn()
    const onEffort = vi.fn()
    composer({ onModel, onEffort })
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('option', { name: /V4 Pro/ }))
    expect(onModel).toHaveBeenCalledWith('deepseek/deepseek-v4-pro')
    fireEvent.click(screen.getByRole('button', { name: 'Effort' }))
    fireEvent.click(screen.getByRole('option', { name: 'High' }))
    expect(onEffort).toHaveBeenCalledWith('high')
  })

  test('shows a vertical icon rail with OpenCode and Favorites tabs', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    const rail = screen.getByRole('navigation', { name: 'Model sources' })
    expect(rail.className).toMatch('flex-col')
    expect(screen.getByRole('tab', { name: 'OpenCode' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Favorites' })).toBeTruthy()
    // The OpenCode tab lists the whole catalog.
    expect(screen.getByRole('option', { name: /Grok 4\.7/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /V4 Pro/ })).toBeTruthy()
  })

  test('stars a model into the Favorites tab and keeps it across opens', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Star DeepSeek V4 Pro' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }))
    expect(screen.getByRole('option', { name: /V4 Pro/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Grok/ })).toBeNull()
    // Unstarred models stay out even when searching.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), { target: { value: 'grok' } })
    expect(screen.queryByRole('option', { name: /Grok/ })).toBeNull()
    expect(screen.getByText('No models found')).toBeTruthy()
  })

  test('starts the Favorites tab empty with a starring hint', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites' }))
    expect(screen.getByText(/star a model/)).toBeTruthy()
  })

  test('sends on Enter and offers the connect command', () => {
    const { onSend } = composer()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hello' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByRole('button', { name: 'Connect another AI' })).toBeTruthy()
  })
})
