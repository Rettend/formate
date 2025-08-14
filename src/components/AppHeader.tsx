import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { ModeToggle } from '~/components/ModeToggle'
import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'
import { useStore } from '~/stores/ui'

export function AppHeader() {
  const [_, setState] = useStore()
  const auth = useAuth()

  return (
    <header class="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="mx-auto h-14 max-w-6xl flex items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <A href="/" class="font-semibold tracking-tight">
            Formate
          </A>
        </div>
        <div class="flex items-center gap-2">
          <ModeToggle set={mode => setState('mode', mode)} />
          <Show
            when={auth.session().user}
            fallback={(
              <div class="hidden items-center gap-2 sm:flex">
                <Button variant="outline" size="sm" onClick={() => auth.signIn('github')}>
                  Sign in
                </Button>
              </div>
            )}
          >
            <div class="flex items-center gap-2">
              <span class="hidden text-xs text-muted-foreground sm:inline">
                {auth.session().user?.name ?? 'Account'}
              </span>
              <Button variant="destructive" size="sm" class="h-8 px-3" onClick={() => auth.signOut()}>
                Logout
              </Button>
            </div>
          </Show>
        </div>
      </div>
    </header>
  )
}
