import type { Provider } from '~/lib/auth'
import { Protected } from '@rttnd/gau/client/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import ApiKeyInput from '~/components/fields/ApiKeyInput'
import { Button } from '~/components/ui/button'
import { providers } from '~/lib/ai/lists'
import { useAuth } from '~/lib/auth'
import { useUIStore } from '~/stores/ui'
import { encryptApiKey } from '~/utils/crypto'

export default Protected(() => <Profile />, '/')

function Profile() {
  const auth = useAuth()
  const { ui, actions } = useUIStore()
  const [inputs, setInputs] = createSignal<Record<string, string>>({})

  const linkedProviders = createMemo<Provider[]>(() => {
    return (auth.session().accounts?.map(a => a.provider) ?? []) as Provider[]
  })

  const unlinkedProviders = createMemo<Provider[]>(() => {
    const all = (auth.session().providers ?? [])
    const linked = new Set(linkedProviders())
    return all.filter(p => !linked.has(p))
  })

  async function saveKey(provider: string, raw: string) {
    if (!raw)
      return deleteKey(provider)
    try {
      const enc = await encryptApiKey(raw)
      actions.setApiKey(provider, enc)
      setInputs(prev => ({ ...prev, [provider]: '' }))
    }
    catch {
      toast.error('Failed to save API key. Please try again.')
    }
  }

  function deleteKey(provider: string) {
    actions.deleteApiKey(provider)
  }
  return (
    <AppShell>
      <section class="space-y-4">
        <h1 class="text-xl font-semibold tracking-tight">Profile</h1>
        <Show when={auth.session().user} fallback={<p class="text-sm text-muted-foreground">You are signed out.</p>}>
          <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm space-y-4">
            <div class="flex items-center gap-4">
              <div class="size-14 flex items-center justify-center overflow-hidden rounded-full bg-muted/50">
                <Show when={auth.session().user?.image} fallback={<span class="i-ph:user-duotone size-7 text-muted-foreground" />}>
                  <img src={auth.session().user?.image ?? undefined} alt="avatar" class="size-full object-cover" />
                </Show>
              </div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">{auth.session().user?.name}</div>
                <div class="truncate text-xs text-muted-foreground">{auth.session().user?.email}</div>
              </div>
              <div class="ml-auto">
                <Button variant="destructive" size="sm" onClick={() => auth.signOut()}>
                  <span class="i-ph:sign-out-bold" />
                  <span class="hidden sm:inline">Sign out</span>
                </Button>
              </div>
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
              <div class="border-y pb-5 pt-2 space-y-3">
                <p class="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
                  Link More
                </p>
                <div class="flex flex-col gap-2">
                  <For each={unlinkedProviders()}>
                    {provider => (
                      <Button
                        variant="outline"
                        size="sm"
                        class="max-w-xs justify-start gap-2"
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

            <div class="pt-2">
              <h2 class="text-sm font-semibold">API keys</h2>
              <p class="mb-2 text-xs text-muted-foreground">Stored locally in your browser. We never send these to our servers.</p>
              <div class="space-y-3">
                <For each={providers.filter(p => p.placeholder)}>
                  {p => (
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div class="w-full text-sm font-medium sm:w-36">{p.title}</div>
                      <div class="min-w-0 flex-1">
                        <Show
                          when={!ui.apiKeys[p.id]}
                          fallback={(
                            <div class="h-10 flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3">
                              <p class="text-sm">API Key saved</p>
                              <Button variant="ghost" size="icon" onClick={() => deleteKey(p.id)}>
                                <span class="i-ph:trash-duotone size-5" />
                              </Button>
                            </div>
                          )}
                        >
                          <ApiKeyInput
                            placeholder={p.placeholder}
                            value={inputs()[p.id] || ''}
                            onInput={v => setInputs(prev => ({ ...prev, [p.id]: v }))}
                            onBlurSave={v => saveKey(p.id, v)}
                          />
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>
      </section>
    </AppShell>
  )
}
