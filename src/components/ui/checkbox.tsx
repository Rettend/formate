import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import type { ValidComponent } from 'solid-js'

import * as CheckboxPrimitive from '@kobalte/core/checkbox'
import { createMemo, Match, splitProps, Switch } from 'solid-js'

import { cn } from '~/utils'

type CheckboxRootProps<T extends ValidComponent = 'div'>
  = CheckboxPrimitive.CheckboxRootProps<T> & { class?: string | undefined }

function Checkbox<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, CheckboxRootProps<T>>) {
  const [local, others] = splitProps(props as CheckboxRootProps, ['class', 'id'])
  const inputId = createMemo(() => (local.id ? `${local.id}-input` : undefined))
  let inputEl: HTMLInputElement | undefined
  return (
    <CheckboxPrimitive.Root
      class={cn('items-top group relative flex space-x-2', local.class)}
      onClick={(e: MouseEvent) => {
        const t = e.target as HTMLElement
        if (t && t.tagName && t.tagName.toLowerCase() !== 'input')
          inputEl?.click()
      }}
      {...others}
    >
      <CheckboxPrimitive.Input ref={(el) => { inputEl = el as HTMLInputElement }} id={inputId()} class="peer" />
      <CheckboxPrimitive.Control onClick={() => inputEl?.click()} class="size-4 shrink-0 border border-primary rounded-sm ring-offset-background disabled:cursor-not-allowed data-[checked]:border-none data-[indeterminate]:border-none data-[checked]:bg-primary data-[indeterminate]:bg-primary data-[checked]:text-primary-foreground data-[indeterminate]:text-primary-foreground disabled:opacity-50 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-ring">
        <CheckboxPrimitive.Indicator>
          <Switch>
            <Match when={!others.indeterminate}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-4"
              >
                <path d="M5 12l5 5l10 -10" />
              </svg>
            </Match>
            <Match when={others.indeterminate}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-4"
              >
                <path d="M5 12l14 0" />
              </svg>
            </Match>
          </Switch>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Control>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
