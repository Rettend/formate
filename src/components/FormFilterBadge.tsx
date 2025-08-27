import { createAsync } from '@solidjs/router'
import { createMemo, Show } from 'solid-js'
import { getForm } from '~/server/forms'
import { useUIStore } from '~/stores/ui'

export function FormFilterBadge() {
  const { ui } = useUIStore()
  const formId = createMemo(() => ui.selectedFormId ?? null)
  const form = createAsync(async () => (formId() ? getForm({ formId: formId() as string }) : null))

  return (
    <Show when={formId()}>
      <div class="mt-1 inline-flex items-center gap-2 rounded-md bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
        <span class="i-ph:funnel-duotone" />
        <span class="truncate">Filtered to <b>{form.latest?.title ?? 'Form'}</b></span>
      </div>
    </Show>
  )
}
