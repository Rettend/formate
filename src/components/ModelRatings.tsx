import type { JSX } from 'solid-js'
import type { ModelConfigObject } from '~/lib/ai/lists'
import { createMemo, For } from 'solid-js'

export function ModelIntelligenceRating(props: { rating?: number }): JSX.Element {
  const rating = createMemo(() => props.rating ?? 0)
  return (
    <div class="flex items-center gap-0.5 text-primary">
      <span class="i-ph:brain-duotone size-3.5" />
      <For each={Array.from({ length: rating() })}>
        {() => <span class="i-ph:circle-fill size-2" />}
      </For>
      <For each={Array.from({ length: 5 - rating() })}>
        {() => <span class="i-ph:circle size-2 opacity-40" />}
      </For>
    </div>
  )
}

export function ModelSpeedRating(props: { rating?: number }): JSX.Element {
  const rating = createMemo(() => props.rating ?? 0)
  return (
    <div class="flex items-center gap-0.5 text-primary">
      <span class="i-ph:lightning-duotone size-3.5" />
      <For each={Array.from({ length: rating() })}>
        {() => <span class="i-ph:circle-fill size-2" />}
      </For>
      <For each={Array.from({ length: 5 - rating() })}>
        {() => <span class="i-ph:circle size-2 opacity-40" />}
      </For>
    </div>
  )
}

export function ModelRatingDisplay(props: { model: ModelConfigObject }): JSX.Element {
  return (
    <div class="flex gap-3">
      <ModelIntelligenceRating rating={props.model.iq} />
      <ModelSpeedRating rating={props.model.speed} />
    </div>
  )
}
