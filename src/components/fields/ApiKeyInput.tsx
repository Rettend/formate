import type { Component } from 'solid-js'
import { splitProps } from 'solid-js'

interface ApiKeyInputProps {
  placeholder?: string
  value: string
  onInput: (next: string) => void
  onBlurSave: (next: string) => void | Promise<void>
  disabled?: boolean
  class?: string
}

export const ApiKeyInput: Component<ApiKeyInputProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'placeholder',
    'value',
    'onInput',
    'onBlurSave',
    'disabled',
    'class',
  ])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void local.onBlurSave(local.value)
    }
  }

  return (
    <input
      type="password"
      autocomplete="off"
      placeholder={local.placeholder}
      class={`h-10 w-full flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none ${local.class ?? ''}`}
      value={local.value}
      onInput={e => local.onInput((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => { void local.onBlurSave(local.value) }}
      onKeyDown={handleKeyDown as any}
      disabled={local.disabled}
      {...rest}
    />
  )
}

export default ApiKeyInput
