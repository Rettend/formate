import { AppShell } from '~/components/AppShell'

export default function Invites() {
  return (
    <AppShell requireAuth>
      <section>
        <h1 class="text-xl font-semibold tracking-tight">Invites</h1>
        <p class="mt-2 text-sm text-muted-foreground">Issue and review invite tokens coming soon.</p>
      </section>
    </AppShell>
  )
}
