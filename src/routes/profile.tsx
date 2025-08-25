import { Protected } from '@rttnd/gau/client/solid'
import { createSignal, For, Show } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
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
                  <span>Sign out</span>
                </Button>
              </div>
            </div>

            <div class="pt-2">
              <h2 class="text-sm font-semibold">API keys</h2>
              <p class="mb-2 text-xs text-muted-foreground">Stored locally in your browser. We never send these to our servers.</p>
              <div class="space-y-3">
                <For each={providers.filter(p => p.placeholder)}>
                  {p => (
                    <div class="flex items-center gap-3">
                      <div class="w-36 text-sm font-medium">{p.title}</div>
                      <div class="flex-1">
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
                          <form
                            class="flex items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              void saveKey(p.id, inputs()[p.id] || '')
                            }}
                          >
                            <input
                              type="password"
                              autocomplete="off"
                              placeholder={p.placeholder}
                              class="h-10 w-full flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none"
                              value={inputs()[p.id] || ''}
                              onInput={e => setInputs(prev => ({ ...prev, [p.id]: (e.currentTarget as HTMLInputElement).value }))}
                            />
                            <Button type="submit" size="sm">Save</Button>
                          </form>
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
