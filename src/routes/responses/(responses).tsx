import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction } from '@solidjs/router'
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { FormFilterBadge } from '~/components/FormFilterBadge'
import { Button } from '~/components/ui/button'
import { listRecentCompletions } from '~/server/analytics'
import { deleteConversation, listFormConversations } from '~/server/conversations'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <ResponsesPage />, '/')

function ResponsesPage() {
  const { ui } = useUIStore()

  const selectedFormId = createMemo(() => ui.selectedFormId ?? null)
  const formId = createMemo(() => selectedFormId())

  const conversations = createAsync(async () => (formId() ? listFormConversations({ formId: formId() as string, page: 1, pageSize: 25 }) : null))
  const recent = createAsync(async () => (!formId() ? listRecentCompletions({ limit: 25 }) : null))
  const doDelete = useAction(deleteConversation)
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null)
  const [confirmArmedAtMs, setConfirmArmedAtMs] = createSignal<number>(0)
  let confirmTimer: number | undefined

  const handleDelete = async (id: string) => {
    if (confirmingId() === id) {
      if (Date.now() - confirmArmedAtMs() < 100)
        return
      await doDelete({ conversationId: id })
      if (formId())
        await revalidate([listFormConversations.key])
      else
        await revalidate([listRecentCompletions.key])
      setConfirmingId(null)
      clearTimeout(confirmTimer)
      return
    }
    setConfirmingId(id)
    setConfirmArmedAtMs(Date.now())
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => setConfirmingId(null), 2500) as unknown as number
  }

  onCleanup(() => clearTimeout(confirmTimer))

  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Responses</h1>
            <Show when={!formId()}>
              <p class="text-sm text-muted-foreground">Recent completions across your forms</p>
            </Show>
            <FormFilterBadge />
          </div>
        </div>

        <Show when={formId()}>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Conversations</h2>
              <div class="text-xs text-muted-foreground">{(conversations.latest?.items?.length ?? 0)} shown</div>
            </div>
            <Show when={(conversations.latest?.items?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No responses yet.</p>}>
              <div class="divide-y">
                <For each={conversations.latest?.items ?? []}>
                  {c => (
                    <div class="flex items-center justify-between gap-3 py-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 text-sm">
                          <span class="font-medium capitalize">{c.status}</span>
                          <Show when={c.endReason}>
                            <span class="opacity-60">•</span>
                            <span class="text-xs text-muted-foreground">End: {c.endReason}</span>
                          </Show>
                        </div>
                        <div class="mt-0.5 text-xs text-muted-foreground">
                          <span>Steps: {c.steps}</span>
                          <span class="mx-2 opacity-60">•</span>
                          <Show when={c.provider && c.modelId}>
                            <span class="text-xs text-muted-foreground">{c.provider} / {c.modelId}</span>
                          </Show>
                          <span class="mx-2 opacity-60">•</span>
                          <Show when={c.completedAt} fallback={<span>Started {new Date(c.startedAt).toLocaleString()}</span>}>
                            <span>Completed {new Date(c.completedAt).toLocaleString()}</span>
                          </Show>
                        </div>
                      </div>
                      <div class="flex shrink-0 items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-destructive/90 hover:bg-transparent hover:text-destructive"
                          title={confirmingId() === c.id ? 'Click to confirm delete' : 'Delete'}
                          aria-label={confirmingId() === c.id ? 'Confirm delete' : 'Delete'}
                          onClick={() => { void handleDelete(c.id) }}
                        >
                          <span class={confirmingId() === c.id ? 'i-ph:check-bold size-4' : 'i-ph:trash-bold size-4'} />
                        </Button>
                        <A href={`/responses/${c.id}`} class="text-xs text-primary">View →</A>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={!formId()}>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Recent completions</h2>
              <div class="text-xs text-muted-foreground">{(recent.latest?.items?.length ?? 0)} shown</div>
            </div>
            <Show when={(recent.latest?.items?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No responses yet.</p>}>
              <div class="divide-y">
                <For each={recent.latest?.items ?? []}>
                  {it => (
                    <div class="flex items-center justify-between gap-3 py-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 text-sm">
                          <span class="font-medium capitalize">{it.formTitle}</span>
                          <Show when={it.endReason}>
                            <span class="opacity-60">•</span>
                            <span class="text-xs text-muted-foreground">End: {it.endReason}</span>
                          </Show>
                        </div>
                        <div class="mt-0.5 text-xs text-muted-foreground">
                          <span>Steps: {it.steps}</span>
                          <span class="mx-2 opacity-60">•</span>
                          <Show when={it.provider && it.modelId}>
                            <span class="text-xs text-muted-foreground">{it.provider} / {it.modelId}</span>
                          </Show>
                          <span class="mx-2 opacity-60">•</span>
                          <Show when={it.completedAt} fallback={<span>Started {new Date(it.startedAt).toLocaleString()}</span>}>
                            <span>Completed {new Date(it.completedAt).toLocaleString()}</span>
                          </Show>
                        </div>
                      </div>
                      <div class="flex shrink-0 items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-destructive/90 hover:bg-transparent hover:text-destructive"
                          title={confirmingId() === it.conversationId ? 'Click to confirm delete' : 'Delete'}
                          aria-label={confirmingId() === it.conversationId ? 'Confirm delete' : 'Delete'}
                          onClick={() => { void handleDelete(it.conversationId) }}
                        >
                          <span class={confirmingId() === it.conversationId ? 'i-ph:check-bold size-4' : 'i-ph:trash-bold size-4'} />
                        </Button>
                        <A href={`/responses/${it.conversationId}`} class="text-xs text-primary">Open →</A>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </section>
    </AppShell>
  )
}
