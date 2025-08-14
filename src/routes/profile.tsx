import { Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'

export default function Profile() {
  const auth = useAuth()
  return (
    <AppShell requireAuth>
      <section class="space-y-4">
        <h1 class="text-xl font-semibold tracking-tight">Profile</h1>
        <Show when={auth.session().user} fallback={<p class="text-sm text-muted-foreground">You are signed out.</p>}>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm space-y-2">
            <div class="text-sm">{auth.session().user?.name}</div>
            <div class="text-xs text-muted-foreground">{auth.session().user?.email}</div>
            <div class="pt-2">
              <Button variant="destructive" size="sm" onClick={() => auth.signOut()}>
                <span class="i-ph:sign-out-bold" />
                <span>Sign out</span>
              </Button>
            </div>
          </div>
        </Show>
      </section>
    </AppShell>
  )
}
