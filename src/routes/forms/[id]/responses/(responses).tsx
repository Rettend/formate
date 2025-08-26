import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, useParams } from '@solidjs/router'
import { createMemo, For, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { listFormConversations } from '~/server/conversations'
import { getForm } from '~/server/forms'

export const route = {
  preload({ params }) {
    return getForm({ formId: params.id })
  },
} satisfies RouteDefinition

export default function FormResponses() {
  const params = useParams()
  const formId = createMemo(() => params.id)
  const form = createAsync(() => getForm({ formId: formId() }))
  const conversations = createAsync(() => listFormConversations({ formId: formId(), page: 1, pageSize: 25 }))

  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Responses</h1>
            <p class="text-sm text-muted-foreground">{form()?.title ?? 'Form'}</p>
          </div>
          <A href={`/forms/${formId()}`} class="inline-flex">
            <Button variant="outline" size="sm">
              <span class="i-ph:arrow-left-bold" />
              <span>Back to form</span>
            </Button>
          </A>
        </div>

        <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold">Conversations</h2>
            <div class="text-xs text-muted-foreground">{(conversations()?.items?.length ?? 0)} shown</div>
          </div>
          <Show when={(conversations()?.items?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No responses yet.</p>}>
            <div class="divide-y">
              <For each={conversations()?.items ?? []}>
                {c => (
                  <div class="flex items-center justify-between gap-3 py-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 text-sm">
                        <span class="font-medium capitalize">{c.status}</span>
                        <Show when={c.endReason}><span class="text-xs text-muted-foreground">· End: {c.endReason}</span></Show>
                      </div>
                      <div class="mt-0.5 text-xs text-muted-foreground">
                        <span>Steps: {c.steps}</span>
                        <span class="mx-2 opacity-60">•</span>
                        <Show when={c.completedAt} fallback={<span>Started {new Date((c as any).startedAt).toLocaleString()}</span>}>
                          <span>Completed {new Date((c as any).completedAt).toLocaleString()}</span>
                        </Show>
                      </div>
                    </div>
                    <div class="shrink-0">
                      <A href={`/forms/${formId()}/responses/${c.id}`} class="text-xs text-primary">View →</A>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
