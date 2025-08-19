import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import type { JSX, ValidComponent } from 'solid-js'

import * as RadioGroupPrimitive from '@kobalte/core/radio-group'
import { splitProps } from 'solid-js'

import { cn } from '~/utils'

type RadioGroupRootProps<T extends ValidComponent = 'div'>
  = RadioGroupPrimitive.RadioGroupRootProps<T> & { class?: string | undefined }

function RadioGroup<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, RadioGroupRootProps<T>>) {
  const [local, others] = splitProps(props as RadioGroupRootProps, ['class'])
  return <RadioGroupPrimitive.Root class={cn('grid gap-2', local.class)} {...others} />
}

type RadioGroupItemProps<T extends ValidComponent = 'div'>
  = RadioGroupPrimitive.RadioGroupItemProps<T> & {
    class?: string | undefined
    children?: JSX.Element
  }

function RadioGroupItem<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, RadioGroupItemProps<T>>) {
  const [local, others] = splitProps(props as RadioGroupItemProps, ['class', 'children'])
  return (
    <RadioGroupPrimitive.Item class={cn('flex items-center space-x-2', local.class)} {...others}>
      <RadioGroupPrimitive.ItemInput />
      <RadioGroupPrimitive.ItemControl class="aspect-square size-4 border border-primary rounded-full text-primary ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring">
        <RadioGroupPrimitive.ItemIndicator class="h-full flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-2.5 fill-current text-current"
          >
            <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          </svg>
        </RadioGroupPrimitive.ItemIndicator>
      </RadioGroupPrimitive.ItemControl>
      {local.children}
    </RadioGroupPrimitive.Item>
  )
}

type RadioGroupLabelProps<T extends ValidComponent = 'label'>
  = RadioGroupPrimitive.RadioGroupLabelProps<T> & {
    class?: string | undefined
  }

function RadioGroupItemLabel<T extends ValidComponent = 'label'>(props: PolymorphicProps<T, RadioGroupLabelProps<T>>) {
  const [local, others] = splitProps(props as RadioGroupLabelProps, ['class'])
  return (
    <RadioGroupPrimitive.ItemLabel
      class={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        local.class,
      )}
      {...others}
    />
  )
}

export { RadioGroup, RadioGroupItem, RadioGroupItemLabel }
