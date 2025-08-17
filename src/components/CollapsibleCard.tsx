import type { JSX } from 'solid-js'
import { splitProps } from 'solid-js'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { cn } from '~/utils'

export interface CollapsibleCardProps {
  title: JSX.Element | string
  description?: JSX.Element | string
  defaultOpen?: boolean
  disabled?: boolean
  class?: string
  contentClass?: string
  onOpenChange?: (open: boolean) => void
  children?: JSX.Element
}

/**
 * CollapsibleCard
 * - One-line header with title and a right-aligned chevron that flips when open
 * - Optional muted description under the title (still within the header)
 * - Card-like surface: border, rounded, bg-card
 * - Animated open/close using CSS grid-rows trick (no JS height measurement)
 *
 * Kobalte Collapsible docs: https://kobalte.dev/docs/core/components/collapsible
 */
export function CollapsibleCard(allProps: CollapsibleCardProps) {
  const [props, rest] = splitProps(allProps, [
    'title',
    'description',
    'defaultOpen',
    'disabled',
    'class',
    'contentClass',
    'onOpenChange',
    'children',
  ])

  return (
    <Collapsible
      {...rest}
      defaultOpen={props.defaultOpen}
      disabled={props.disabled}
      onOpenChange={props.onOpenChange}
      class={cn('border rounded-lg bg-card text-card-foreground', props.class)}
    >
      <CollapsibleTrigger
        class={cn(
          'group w-full px-4 py-3 flex items-start gap-3 text-left',
          'rounded-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label={typeof props.title === 'string' ? props.title : undefined}
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <div class="truncate font-medium tracking-tight">{props.title}</div>
            <span
              aria-hidden
              class={cn(
                'i-ph:caret-down-bold size-4 shrink-0 opacity-70 transition-transform duration-200',
                'group-data-[expanded]:rotate-180',
              )}
            />
          </div>
          {props.description && (
            <div class="line-clamp-2 mt-0.5 text-xs text-muted-foreground">{props.description}</div>
          )}
        </div>
      </CollapsibleTrigger>

      {/* Animated content: grid-rows transition + overflow-hidden */}
      <CollapsibleContent
        class={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out grid-rows-[0fr] data-[expanded]:grid-rows-[1fr]',
          props.contentClass,
        )}
      >
        <div class="min-h-0 overflow-hidden px-4 pb-4">
          {props.children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default CollapsibleCard
