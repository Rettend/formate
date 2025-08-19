import { Protected } from '@rttnd/gau/client/solid'
import { A } from '@solidjs/router'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'

export default Protected(() => <Dashboard />, '/')

function Dashboard() {
  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p class="text-sm text-muted-foreground">Overview and quick actions</p>
          </div>
          <A href="/forms/new" class="inline-flex">
            <Button variant="default" size="sm">Create form</Button>
          </A>
        </div>

        <div class="grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Forms</p>
            <p class="text-2xl font-semibold">0</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Responses (7d)</p>
            <p class="text-2xl font-semibold">0</p>
          </div>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
            <p class="text-xs text-muted-foreground">Active conversations</p>
            <p class="text-2xl font-semibold">0</p>
          </div>
        </div>

        <div class="mt-6 border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">Recent activity</h2>
            <A href="/forms" class="text-xs text-primary">View forms →</A>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">No activity yet.</p>
        </div>
      </section>
    </AppShell>
  )
}
