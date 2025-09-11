import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction } from '@solidjs/router'
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { FormFilterBadge } from '~/components/FormFilterBadge'
import { Button } from '~/components/ui/button'
import { completeConversation, deleteConversation, listFormConversations, listOwnerConversations, reopenConversation } from '~/server/conversations'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <ResponsesPage />, '/')

function ResponsesPage() {
  const { ui } = useUIStore()

  const selectedFormId = createMemo(() => ui.selectedFormId ?? null)
  const formId = createMemo(() => selectedFormId())

  const [page, setPage] = createSignal(1)

  const results = createAsync(async () => (formId()
    ? listFormConversations({ formId: formId() as string, page: page(), pageSize: 25 })
    : listOwnerConversations({ page: page(), pageSize: 25 })))

  // Reset pagination when filter changes
  createEffect(() => {
    const id = formId()
    setPage(1)
    if (id)
      void revalidate([listFormConversations.key])
    else
      void revalidate([listOwnerConversations.key])
  })
  const doDelete = useAction(deleteConversation)
  const doComplete = useAction(completeConversation)
  const doReopen = useAction(reopenConversation)
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
        await revalidate([listOwnerConversations.key])
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

  const handleComplete = async (id: string) => {
    await doComplete({ conversationId: id })
    if (formId())
      await revalidate([listFormConversations.key])
    else
      await revalidate([listOwnerConversations.key])
  }

  const handleReopen = async (id: string) => {
    await doReopen({ conversationId: id })
    if (formId())
      await revalidate([listFormConversations.key])
    else
      await revalidate([listOwnerConversations.key])
  }

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

        <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold">{formId() ? 'Conversations' : 'All responses'}</h2>
            <div class="text-xs text-muted-foreground">
              <span>Page {results.latest?.page ?? page()}</span>
              <span class="mx-2 opacity-60">•</span>
              <span>{(results.latest?.items?.length ?? 0)} / {results.latest?.total ?? 0}</span>
            </div>
          </div>
          <Show when={(results.latest?.items?.length ?? 0) > 0}>
            <div class="my-3 flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={(results.latest?.page ?? page()) <= 1}
                onClick={() => {
                  setPage(p => Math.max(1, p - 1))
                  if (formId())
                    void revalidate([listFormConversations.key])
                  else
                    void revalidate([listOwnerConversations.key])
                }}
              >
                ← Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!results.latest?.hasMore}
                onClick={() => {
                  setPage(p => p + 1)
                  if (formId())
                    void revalidate([listFormConversations.key])
                  else
                    void revalidate([listOwnerConversations.key])
                }}
              >
                Next →
              </Button>
            </div>
          </Show>
          <Show when={(results.latest?.items?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No responses yet.</p>}>
            <div class="divide-y">
              <For each={results.latest?.items ?? []}>
                {it => (
                  <div class="flex items-center justify-between gap-3 py-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 text-sm">
                        <Show when={!formId()} fallback={<span class="font-medium capitalize">{it.status}</span>}>
                          <span class="font-medium capitalize">{it.formTitle}</span>
                          <Show when={it.formSlug}>
                            <span class="text-xs text-muted-foreground">/{it.formSlug}</span>
                          </Show>
                        </Show>
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
                        <Show when={it.completedAt} fallback={<span>Started {new Date(it.startedAt!).toLocaleString()}</span>}>
                          <span>Completed {new Date(it.completedAt!).toLocaleString()}</span>
                        </Show>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-3">
                      <Show when={it.status !== 'completed'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Mark completed"
                          aria-label="Mark completed"
                          class="hover:bg-transparent"
                          onClick={() => { void handleComplete(it.id) }}
                        >
                          <span class="i-ph:check-bold size-4" />
                        </Button>
                      </Show>
                      <Show when={it.status === 'completed'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reopen"
                          aria-label="Reopen"
                          class="hover:bg-transparent"
                          onClick={() => { void handleReopen(it.id) }}
                        >
                          <span class="i-ph:arrow-counter-clockwise-bold size-4" />
                        </Button>
                      </Show>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-destructive/90 hover:bg-transparent hover:text-destructive"
                        title={confirmingId() === it.id ? 'Click to confirm delete' : 'Delete'}
                        aria-label={confirmingId() === it.id ? 'Confirm delete' : 'Delete'}
                        onClick={() => { void handleDelete(it.id) }}
                      >
                        <span class={confirmingId() === it.id ? 'i-ph:check-bold size-4' : 'i-ph:trash-bold size-4'} />
                      </Button>
                      <A href={`/responses/${it.id}`} class="text-xs text-primary">{formId() ? 'View' : 'Open'} →</A>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={(results.latest?.page ?? page()) <= 1}
                onClick={() => {
                  setPage(p => Math.max(1, p - 1))
                  if (formId())
                    void revalidate([listFormConversations.key])
                  else
                    void revalidate([listOwnerConversations.key])
                }}
              >
                ← Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!results.latest?.hasMore}
                onClick={() => {
                  setPage(p => p + 1)
                  if (formId())
                    void revalidate([listFormConversations.key])
                  else
                    void revalidate([listOwnerConversations.key])
                }}
              >
                Next →
              </Button>
            </div>
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
