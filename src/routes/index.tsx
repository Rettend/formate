import type { Provider } from '~/lib/auth'
import { A } from '@solidjs/router'
import { createMemo, For, Show } from 'solid-js'
import { ModeToggle } from '~/components/ModeToggle'
import { SignInCard } from '~/components/SignInCard'
import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'
import { useUIStore } from '~/stores/ui'

export default function Home() {
  const { setUI } = useUIStore()
  const auth = useAuth()

  const linkedProviders = createMemo<Provider[]>(() => {
    return (auth.session().accounts?.map(a => a.provider) ?? []) as Provider[]
  })

  const unlinkedProviders = createMemo<Provider[]>(() => {
    const all = (auth.session().providers ?? [])
    const linked = new Set(linkedProviders())
    return all.filter(p => !linked.has(p))
  })

  return (
    <main class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between gap-2 p-4">
        <div class="flex items-center gap-3">
          <span class="font-semibold tracking-tight">Formate</span>
        </div>
        <div class="flex items-center gap-2">
          <ModeToggle set={mode => setUI('mode', mode)} />
        </div>
      </header>

      {/* Centered content */}
      <section class="flex flex-1 items-center justify-center px-4 pb-12">
        <div class="max-w-sm w-full">
          <Show
            when={auth.session().user}
            fallback={<SignInCard />}
          >
            <div class="border rounded-lg bg-card p-6 text-card-foreground shadow-sm space-y-6">
              {/* User header */}
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-0.5">
                  <h2 class="text-base font-semibold leading-none">{auth.session().user?.name}</h2>
                  <p class="break-all text-xs text-muted-foreground">{auth.session().user?.email}</p>
                </div>
                <Button variant="destructive" size="sm" class="h-8 px-3" onClick={() => auth.signOut()}>
                  <span class="i-ph:sign-out-bold" />
                  <span>Logout</span>
                </Button>
              </div>

              {/* Quick links */}
              <div class="grid gap-2 sm:grid-cols-2">
                <A href="/dashboard" class="border rounded-md p-3 hover:bg-accent">
                  <div class="text-sm font-medium">Go to Dashboard</div>
                  <div class="text-xs text-muted-foreground">Overview and quick actions</div>
                </A>
                <A href="/forms" class="border rounded-md p-3 hover:bg-accent">
                  <div class="text-sm font-medium">Manage Forms</div>
                  <div class="text-xs text-muted-foreground">List and edit your forms</div>
                </A>
              </div>

              {/* Linked accounts */}
              <div class="space-y-3">
                <p class="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
                  Linked Accounts
                </p>
                <div class="flex flex-wrap gap-2">
                  <Show
                    when={linkedProviders().length > 0}
                    fallback={<span class="text-xs text-muted-foreground">No linked accounts yet.</span>}
                  >
                    <For each={linkedProviders()}>
                      {provider => (
                        <div class="group flex items-center gap-1 border rounded-full px-2 py-1 text-xs">
                          <span
                            classList={{
                              'i-ph:github-logo': provider === 'github',
                              'i-ph:google-logo-bold': provider === 'google',
                            }}
                            class="size-4"
                          />
                          <span class="capitalize">{provider}</span>
                          <button
                            class="i-ph:x-bold size-3.5 opacity-40 transition hover:opacity-100"
                            aria-label={`Unlink ${provider}`}
                            onClick={() => auth.unlinkAccount(provider)}
                          />
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>

              {/* Link more */}
              <Show when={unlinkedProviders().length > 0}>
                <div class="border-t pt-2 space-y-3">
                  <p class="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
                    Link More
                  </p>
                  <div class="flex flex-col gap-2">
                    <For each={unlinkedProviders()}>
                      {provider => (
                        <Button
                          variant="outline"
                          size="sm"
                          class="justify-start gap-2"
                          onClick={() => auth.linkAccount(provider)}
                        >
                          <span
                            classList={{
                              'i-ph:github-logo': provider === 'github',
                              'i-ph:google-logo-bold': provider === 'google',
                            }}
                            class="size-4"
                          />
                          <span class="capitalize">Link {provider}</span>
                        </Button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </section>
    </main>
  )
}
