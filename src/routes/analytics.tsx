import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync } from '@solidjs/router'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { FormFilterBadge } from '~/components/FormFilterBadge'
import { Button } from '~/components/ui/button'
import { LineChart } from '~/components/ui/charts'
import { getCompletionTimeSeries, getFormBreakdown, getFunnelStats } from '~/server/analytics'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <Analytics />, '/')

function Analytics() {
  const { ui, actions } = useUIStore()
  const [range, setRange] = createSignal<'7d' | '30d' | '90d'>('7d')
  const formId = createMemo(() => ui.selectedFormId ?? null)
  const series = createAsync(() => getCompletionTimeSeries({ range: range(), formId: formId() }))
  const funnel = createAsync(() => getFunnelStats({ range: range(), formId: formId() }))
  const breakdown = createAsync(() => getFormBreakdown({ range: range(), formId: formId() }))

  const chartData = createMemo(() => {
    const buckets = series.latest?.buckets ?? []
    return {
      labels: buckets.map(b => b.date.slice(5)),
      datasets: [
        {
          label: 'Completions',
          data: buckets.map(b => b.count ?? 0),
          fill: true,
          tension: 0.3,
        },
      ],
    }
  })

  return (
    <AppShell>
      <section class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Analytics</h1>
            <FormFilterBadge />
          </div>
          <div class="flex items-center gap-2">
            <Button size="sm" variant={range() === '7d' ? 'default' : 'outline'} onClick={() => setRange('7d')}>7d</Button>
            <Button size="sm" variant={range() === '30d' ? 'default' : 'outline'} onClick={() => setRange('30d')}>30d</Button>
            <Button size="sm" variant={range() === '90d' ? 'default' : 'outline'} onClick={() => setRange('90d')}>90d</Button>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Started</p>
            <p class="text-2xl font-semibold">{funnel.latest?.started ?? 0}</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Completed</p>
            <p class="text-2xl font-semibold">{funnel.latest?.completed ?? 0}</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Completion rate</p>
            <p class="text-2xl font-semibold">{(funnel.latest?.completionRate ?? 0)}%</p>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="overflow-hidden border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Completions over time</h2>
            </div>
            <Show when={(series.latest?.buckets?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No data.</p>}>
              <div class="h-48 w-full sm:h-64">
                <LineChart data={chartData()} height={256} />
              </div>
            </Show>
          </div>

          <div class="overflow-hidden border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Top forms</h2>
            </div>
            <Show when={(breakdown.latest?.items?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No data.</p>}>
              <div class="divide-y">
                <For each={breakdown.latest?.items ?? []}>
                  {it => (
                    <div class="flex items-center justify-between gap-3 py-2 text-sm">
                      <div class="min-w-0">
                        <div class="truncate font-medium">{it.title}</div>
                        <div class="mt-0.5 text-xs text-muted-foreground">{it.completed} completed · {it.completionRate}% · avg {it.avgSteps} steps</div>
                      </div>
                      <div class="shrink-0">
                        <A
                          class="text-xs text-primary"
                          href={`/responses?formId=${it.formId}`}
                          onMouseUp={(e) => {
                            if (e.button === 0 || e.button === 1)
                              actions.setSelectedForm(it.formId)
                          }}
                        >
                          Responses →
                        </A>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
