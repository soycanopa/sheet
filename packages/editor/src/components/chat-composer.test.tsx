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

  test('lists short names with the provider underneath, grouped by rail', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByRole('option', { name: /Grok 4\.7/ })?.textContent).toMatch('xAI')
    // DeepSeek lives behind its own rail tab.
    expect(screen.queryByRole('option', { name: /DeepSeek/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }))
    const row = screen.getByRole('option', { name: /DeepSeek V4\.1/ })
    expect(row.textContent).toMatch('DeepSeek V4.1 Flash 1017')
    expect(row.textContent).not.toMatch('deepseek/')
  })

  test('filters models by search', () => {
    composer()
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), { target: { value: 'pro' } })
    expect(screen.queryByRole('option', { name: /Flash/ })).toBeNull()
    expect(screen.getByRole('option', { name: /V4 Pro/ })).toBeTruthy()
  })

  test('picks a model and an effort', () => {
    const onModel = vi.fn()
    const onEffort = vi.fn()
    composer({ onModel, onEffort })
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }))
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
