import { Protected } from '@rttnd/gau/client/solid'
import { AppShell } from '~/components/AppShell'

export default Protected(() => <Analytics />, '/')

function Analytics() {
  return (
    <AppShell>
      <section>
        <h1 class="text-xl font-semibold tracking-tight">Analytics</h1>
        <p class="mt-2 text-sm text-muted-foreground">Coming soon.</p>
      </section>
    </AppShell>
  )
}
