import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync } from '@solidjs/router'
import { createMemo, For, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { getDashboardStats, listRecentCompletions } from '~/server/analytics'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <Dashboard />, '/')

function Dashboard() {
  const { ui } = useUIStore()
  const formId = createMemo(() => ui.selectedFormId ?? null)
  const stats = createAsync(() => getDashboardStats({ formId: formId() }))
  const recent = createAsync(() => listRecentCompletions({ limit: 5, formId: formId() }))
  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p class="text-sm text-muted-foreground">Overview and quick actions</p>
            <Show when={formId()}>
              <div class="mt-1 inline-flex items-center gap-2 rounded-md bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <span class="i-ph:funnel-duotone" />
                <span>Filtered to one form</span>
              </div>
            </Show>
          </div>
          <A href="/forms/new" class="inline-flex">
            <Button variant="default" size="sm">Create form</Button>
          </A>
        </div>

        <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Forms</p>
            <p class="text-2xl font-semibold">{stats.latest?.totalForms ?? 0}</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Responses (7d)</p>
            <p class="text-2xl font-semibold">{stats.latest?.responses7d ?? 0}</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Active conversations</p>
            <p class="text-2xl font-semibold">{stats.latest?.activeConversations ?? 0}</p>
          </div>
        </div>

        <div class="mt-6 border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">Recent activity</h2>
            <A href="/forms" class="text-xs text-primary">View forms →</A>
          </div>
          <Show when={(recent.latest?.items?.length ?? 0) > 0} fallback={<p class="mt-2 text-sm text-muted-foreground">No activity yet.</p>}>
            <ul class="mt-3 space-y-2">
              <For each={recent.latest?.items ?? []}>
                {it => (
                  <li class="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2 text-sm">
                    <div class="min-w-0">
                      <div class="truncate font-medium">{it.formTitle}</div>
                      <div class="mt-0.5 text-xs text-muted-foreground">
                        <span>Steps: {it.steps}</span>
                        <span class="mx-2 opacity-60">•</span>
                        <span>Completed {new Date(it.completedAt as any).toLocaleString()}</span>
                      </div>
                    </div>
                    <div class="shrink-0">
                      <A href={`/responses/${it.conversationId}`} class="text-xs text-primary">Open →</A>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
