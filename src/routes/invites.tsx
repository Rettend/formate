import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction } from '@solidjs/router'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput } from '~/components/ui/number-field'
import { listForms } from '~/server/forms'
import { createInviteTokens, listUsedInviteTokens } from '~/server/invites'

export default Protected(() => <Invites />, '/')

function Invites() {
  const forms = createAsync(() => listForms({ page: 1, pageSize: 100 }))
  const used = createAsync(() => listUsedInviteTokens())
  const gen = useAction(createInviteTokens)
  const [countByForm, setCountByForm] = createSignal<Record<string, number>>({})

  const byFormUsed = createMemo(() => used()?.byForm ?? {})

  const handleGenerate = async (formId: string, _slug?: string) => {
    const count = Math.max(1, Math.min(100, Number(countByForm()[formId] ?? 1)))
    try {
      const res = await gen({ formId, count })
      const codes = res?.codes ?? []
      if (codes.length === 0) {
        toast.error('No tokens generated')
        return
      }
      const base = typeof window !== 'undefined' ? window.location.origin : ''
      const urls = codes.map((t: any) => `${base}/r/${t.code}`)
      await navigator.clipboard.writeText(urls.join('\n'))
      toast.success(`Generated ${codes.length} invite${codes.length > 1 ? 's' : ''}. Links copied to clipboard.`)
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate')
    }
    finally {
      await revalidate([listUsedInviteTokens.key])
    }
  }

  return (
    <AppShell>
      <section class="space-y-6">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Invites</h1>
          <p class="mt-2 text-sm text-muted-foreground">Generate single-use invite links for your forms and review used tokens below.</p>
        </div>

        <div class="space-y-8">
          <For each={forms()?.items ?? []}>
            {f => (
              <div class="border rounded-lg bg-card p-4 text-card-foreground">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-base font-medium">{f.title}</div>
                    <div class="text-xs text-muted-foreground">ID: {f.id}</div>
                  </div>
                  <A href={`/r/${f.slug || f.id}`}>
                    <Button size="sm" variant="outline">
                      <span class="i-ph:link-bold" />
                      <span>Open</span>
                    </Button>
                  </A>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <NumberField
                    minValue={1}
                    maxValue={100}
                    value={countByForm()[f.id] ?? 1}
                    onChange={v => setCountByForm(prev => ({ ...prev, [f.id]: Number(v || 1) }))}
                    class="w-28"
                  >
                    <NumberFieldGroup>
                      <NumberFieldInput aria-label="Invite count" />
                      <NumberFieldDecrementTrigger />
                      <NumberFieldIncrementTrigger />
                    </NumberFieldGroup>
                  </NumberField>
                  <Button size="sm" onClick={() => handleGenerate(f.id, f.slug ?? undefined)}>
                    <span class="i-ph:magic-wand-bold" />
                    <span>Generate</span>
                  </Button>
                </div>

                <div class="mt-4">
                  <div class="text-sm font-medium">Redeemed invites</div>
                  <Show when={(byFormUsed()[f.id]?.used?.length ?? 0) > 0} fallback={<p class="text-xs text-muted-foreground">None yet.</p>}>
                    <ul class="mt-2 text-xs space-y-1">
                      <For each={byFormUsed()[f.id]?.used ?? []}>
                        {u => (
                          <li class="flex items-center justify-between gap-2">
                            <code class="code">{u.jti.slice(0, 6)}…{u.jti.slice(-4)}</code>
                            <span class="text-muted-foreground">{new Date(u.usedAt as any).toLocaleString()}</span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </AppShell>
  )
}
