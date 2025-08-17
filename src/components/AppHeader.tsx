import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { ModeToggle } from '~/components/ModeToggle'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { useAuth } from '~/lib/auth'
import { useUIStore } from '~/stores/ui'

export function AppHeader() {
  const { setUI } = useUIStore()
  const auth = useAuth()
  const redirectTo = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined

  return (
    <header class="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="mx-auto h-14 max-w-6xl flex items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <A href="/" class="font-semibold tracking-tight">
            Formate
          </A>
        </div>
        <div class="flex items-center gap-2">
          <ModeToggle set={mode => setUI('mode', mode)} />
          <Show
            when={auth.session().user}
            fallback={(
              <div class="hidden items-center gap-2 sm:flex">
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button variant="outline" size="sm" class="gap-2">
                      <span class="i-ph:sign-in-bold" />
                      <span>Sign in</span>
                      <span class="i-ph:caret-down-bold size-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => auth.signIn('github', { redirectTo })}>
                      <span class="i-ph:github-logo-bold" />
                      <span>GitHub</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => auth.signIn('google', { redirectTo })}>
                      <span class="i-ph:google-logo-bold" />
                      <span>Google</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger>
                <button class="flex items-center gap-2 border rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span class="i-ph:user-circle-duotone size-5" />
                  <span class="hidden max-w-40 truncate text-left sm:inline">
                    {auth.session().user?.name ?? 'Account'}
                  </span>
                  <span class="i-ph:caret-down-bold size-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="min-w-48">
                <div class="px-2 py-1.5 text-xs text-muted-foreground">
                  <div class="truncate text-foreground font-medium">{auth.session().user?.name ?? 'Account'}</div>
                  <div class="truncate">{auth.session().user?.email}</div>
                </div>
                <DropdownMenuSeparator />
                <A href="/dashboard" class="block">
                  <DropdownMenuItem>
                    <span class="i-ph:squares-four-duotone" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>
                </A>
                <A href="/forms" class="block">
                  <DropdownMenuItem>
                    <span class="i-ph:files-duotone" />
                    <span>Forms</span>
                  </DropdownMenuItem>
                </A>
                <A href="/profile" class="block">
                  <DropdownMenuItem>
                    <span class="i-ph:user-circle-duotone" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                </A>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" onClick={() => auth.signOut()}>
                  <span class="i-ph:sign-out-bold" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </div>
      </div>
    </header>
  )
}
