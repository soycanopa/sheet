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
  afterEach(() => cleanup())

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

  test('sends on Enter and offers the connect command', () => {
    const { onSend } = composer()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hello' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hello')
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByRole('button', { name: 'Connect another AI' })).toBeTruthy()
  })
})
