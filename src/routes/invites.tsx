import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction } from '@solidjs/router'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput } from '~/components/ui/number-field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { listForms } from '~/server/forms'
import { createInviteTokens, listInvitesByForm, revokeInvite, updateInviteLabel } from '~/server/invites'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <Invites />, '/')

function Invites() {
  const { ui } = useUIStore()
  const forms = createAsync(() => listForms({ page: 1, pageSize: 100 }))
  const invites = createAsync(() => listInvitesByForm({ formId: ui.selectedFormId ?? undefined }))
  const gen = useAction(createInviteTokens)
  const doRevoke = useAction(revokeInvite)
  const doUpdateLabel = useAction(updateInviteLabel)

  const [countByForm, setCountByForm] = createSignal<Record<string, number>>({})
  const [labelsByForm, setLabelsByForm] = createSignal<Record<string, string[]>>({})
  const [editingLabel, setEditingLabel] = createSignal<{ jti: string, value: string } | null>(null)

  const byForm = createMemo(() => invites.latest?.byForm ?? {})
  const visibleForms = createMemo(() => {
    const all = forms.latest?.items ?? []
    const fid = ui.selectedFormId
    return fid ? all.filter(f => f.id === fid) : all
  })

  onMount(() => {
    if (typeof window === 'undefined')
      return

    const applyHashScroll = () => {
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash)
        return
      queueMicrotask(() => {
        const el = document.getElementById(hash)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }

    applyHashScroll()
    const onHashChange = () => applyHashScroll()
    window.addEventListener('hashchange', onHashChange)
    onCleanup(() => window.removeEventListener('hashchange', onHashChange))
  })

  const handleGenerate = async (formId: string, _slug?: string) => {
    const count = Math.max(1, Math.min(10, Number(countByForm()[formId] ?? 1)))
    const labels = (labelsByForm()[formId] ?? []).slice(0, count)
    try {
      const payload = labels.length > 0
        ? { formId, entries: labels.map(l => ({ label: l?.trim() ? l.trim() : null })) }
        : { formId, count }
      const res = await gen(payload as any)
      const codes = res?.codes ?? []
      if (codes.length === 0) {
        toast.error('No invites generated')
        return
      }
      const base = typeof window !== 'undefined' ? window.location.origin : ''
      const urls = codes.map((t: any) => `${base}/r/${t.code}`)
      await navigator.clipboard.writeText(urls.join('\n'))
      toast.success(`Generated ${codes.length} invite${codes.length > 1 ? 's' : ''}. Links copied to clipboard.`)
      setCountByForm(prev => ({ ...prev, [formId]: 1 }))
      setLabelsByForm(prev => ({ ...prev, [formId]: [''] }))
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate')
    }
    finally {
      await revalidate([listInvitesByForm.key])
    }
  }

  const copyLink = async (code: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${base}/r/${code}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Invite link copied')
    }
    catch {
      toast.error('Failed to copy')
    }
  }

  const handleRevoke = async (jti: string) => {
    try {
      await doRevoke({ jti })
      toast.success('Invite revoked')
      await revalidate([listInvitesByForm.key])
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke')
    }
  }

  const startEdit = (jti: string, current?: string | null) => {
    setEditingLabel({ jti, value: current ?? '' })
  }
  const saveEdit = async () => {
    const e = editingLabel()
    if (!e)
      return
    try {
      await doUpdateLabel({ jti: e.jti, label: e.value.trim() || null })
      setEditingLabel(null)
      await revalidate([listInvitesByForm.key])
      toast.success('Label updated')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update label')
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
          <For each={visibleForms()}>
            {f => (
              <div id={`form-${f.slug || f.id}`} class="scroll-mt-20 border rounded-lg bg-card p-4 text-card-foreground">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-base font-medium">{f.title}</div>
                    <div class="text-xs text-muted-foreground">
                      {f.slug
                        ? (
                            <span>Slug: <code class="code">/{f.slug}</code></span>
                          )
                        : (
                            <span>ID: {f.id}</span>
                          )}
                    </div>
                  </div>
                  <A href={`/forms/${f.id}`}>
                    <Button size="sm" variant="outline">
                      <span>View</span>
                      <span class="i-ph:arrow-right-bold" />
                    </Button>
                  </A>
                </div>

                {/* Generator */}
                <div class="mt-4">
                  <div class="text-sm font-medium">Generate invites</div>
                  <div class="mt-2 flex flex-col gap-3">
                    <div class="flex items-center gap-3">
                      <NumberField
                        minValue={1}
                        maxValue={10}
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
                      <Button size="sm" class="text-sm" onClick={() => handleGenerate(f.id, f.slug ?? undefined)}>
                        <span>Generate & Copy</span>
                      </Button>
                    </div>

                    <div class="flex flex-col gap-2">
                      <For each={Array.from({ length: Math.max(1, Math.min(10, Number(countByForm()[f.id] ?? 1))) })}>
                        {(_, i) => (
                          <div class="flex items-center gap-2">
                            <div class="w-4 text-right text-xs text-muted-foreground">{i() + 1}.</div>
                            <input
                              class="h-8 max-w-md w-full border border-input rounded-md bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                              placeholder="Optional label"
                              value={labelsByForm()[f.id]?.[i()] ?? ''}
                              onInput={e => setLabelsByForm((prev) => {
                                const arr = (prev[f.id] ?? []).slice()
                                arr[i()] = e.currentTarget.value ?? ''
                                return { ...prev, [f.id]: arr }
                              })}
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>

                {/* Invites list */}
                <div class="mt-6">
                  <Tabs defaultValue="unused">
                    <div class="flex items-center justify-between">
                      <div class="text-sm font-medium">Invites</div>
                      <TabsList>
                        <TabsTrigger value="unused">Unused ({(byForm()[f.id]?.unused?.length ?? 0)})</TabsTrigger>
                        <TabsTrigger value="used">Used ({(byForm()[f.id]?.used?.length ?? 0)})</TabsTrigger>
                        <TabsTrigger value="revoked">Revoked ({(byForm()[f.id]?.revoked?.length ?? 0)})</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="unused">
                      <Show when={(byForm()[f.id]?.unused?.length ?? 0) > 0} fallback={<p class="text-xs text-muted-foreground">No unused invites.</p>}>
                        <ul class="mt-2 space-y-2">
                          <For each={byForm()[f.id]?.unused ?? []}>
                            {inv => (
                              <li class="flex items-center justify-between gap-3 border rounded-md bg-background p-2">
                                <div class="min-w-0">
                                  <div class="flex items-center gap-2">
                                    <Show when={editingLabel()?.jti === inv.jti} fallback={<button class="font-medium hover:underline" onClick={() => startEdit(inv.jti, inv.label)}>{inv.label || 'Unnamed invite'}</button>}>
                                      <input
                                        class="h-7 w-56 border border-input rounded-md bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                                        value={editingLabel()?.value || ''}
                                        onInput={e => setEditingLabel(cur => (cur ? { ...cur, value: e.currentTarget.value } : cur))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter')
                                            saveEdit()
                                        }}
                                      />
                                      <Button size="sm" variant="ghost" class="ml-1" onClick={saveEdit}><span class="i-ph:check-bold" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => setEditingLabel(null)}><span class="i-ph:x-bold" /></Button>
                                    </Show>
                                    <code class="code text-xs">{inv.code}</code>
                                  </div>
                                  <div class="mt-1 text-xs text-muted-foreground">Created {new Date(inv.createdAt as any).toLocaleString()}{inv.expAt ? ` · Expires ${new Date(inv.expAt as any).toLocaleString()}` : ''}</div>
                                </div>
                                <div class="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(inv.code)}>
                                    <span class="i-ph:copy-bold" />
                                  </Button>
                                  <Button size="icon" variant="ghost" title="Edit label" onClick={() => startEdit(inv.jti, inv.label)}>
                                    <span class="i-ph:pencil-simple-line-bold" />
                                  </Button>
                                  <Button size="icon" variant="ghost" class="text-destructive" title="Revoke" onClick={() => handleRevoke(inv.jti)}>
                                    <span class="i-ph:trash-simple-bold" />
                                  </Button>
                                </div>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </TabsContent>

                    <TabsContent value="used">
                      <Show when={(byForm()[f.id]?.used?.length ?? 0) > 0} fallback={<p class="text-xs text-muted-foreground">No used invites yet.</p>}>
                        <ul class="mt-2 space-y-2">
                          <For each={byForm()[f.id]?.used ?? []}>
                            {inv => (
                              <li class="flex items-center justify-between gap-3 border rounded-md bg-muted/30 p-2">
                                <div class="min-w-0">
                                  <div class="flex items-center gap-2">
                                    <div class="font-medium">{inv.label || 'Unnamed invite'}</div>
                                    <code class="code text-xs">{inv.code}</code>
                                  </div>
                                  <div class="mt-1 text-xs text-muted-foreground">Used {new Date(inv.usedAt as any).toLocaleString()}</div>
                                </div>
                                <div class="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(inv.code)}>
                                    <span class="i-ph:copy-bold" />
                                  </Button>
                                </div>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </TabsContent>

                    <TabsContent value="revoked">
                      <Show when={(byForm()[f.id]?.revoked?.length ?? 0) > 0} fallback={<p class="text-xs text-muted-foreground">No revoked invites.</p>}>
                        <ul class="mt-2 space-y-2">
                          <For each={byForm()[f.id]?.revoked ?? []}>
                            {inv => (
                              <li class="flex items-center justify-between gap-3 border rounded-md bg-muted/20 p-2">
                                <div class="min-w-0">
                                  <div class="flex items-center gap-2">
                                    <div class="font-medium">{inv.label || 'Unnamed invite'}</div>
                                    <code class="code text-xs">{inv.code}</code>
                                  </div>
                                  <div class="mt-1 text-xs text-muted-foreground">Revoked {new Date((inv as any).revokedAt).toLocaleString()}</div>
                                </div>
                                <div class="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(inv.code)}>
                                    <span class="i-ph:copy-bold" />
                                  </Button>
                                </div>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>
    </AppShell>
  )
}
