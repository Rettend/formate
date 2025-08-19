import type { RouteDefinition } from '@solidjs/router'
import { Protected } from '@rttnd/gau/client/solid'
import { debounce } from '@solid-primitives/scheduled'
import { A, createAsync, revalidate, useAction, useNavigate, useParams, useSubmissions } from '@solidjs/router'
import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import CollapsibleCard from '~/components/CollapsibleCard'
import { LLMBuilder } from '~/components/forms/LLMBuilder'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput } from '~/components/ui/number-field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { clearFormProviderKey, deleteForm, getForm, publishForm, saveFormAccess, saveFormProviderKey, saveFormStopping, unpublishForm } from '~/server/forms'

export const route = {
  preload({ params }) {
    return getForm({ formId: params.id })
  },
} satisfies RouteDefinition

export default Protected(() => <FormDetail />, '/')

function FormDetail() {
  const params = useParams()
  const id = createMemo(() => params.id)
  const nav = useNavigate()
  const publish = useAction(publishForm)
  const unpublish = useAction(unpublishForm)
  const publishSubs = useSubmissions(publishForm)
  const unpublishSubs = useSubmissions(unpublishForm)
  const saveStoppingSubs = useSubmissions(saveFormStopping)
  const remove = useAction(deleteForm)
  const saveStopping = useAction(saveFormStopping)
  const saveKey = useAction(saveFormProviderKey)
  const clearKey = useAction(clearFormProviderKey)
  const saveAccess = useAction(saveFormAccess)
  const form = createAsync(() => getForm({ formId: id() }))
  const [saving, setSaving] = createSignal(false)
  const [stopping, setStopping] = createSignal<{ hardLimit: { maxQuestions: number }, llmMayEnd: boolean, endReasons: Array<'enough_info' | 'trolling'> }>()
  const [providerKeyInput, setProviderKeyInput] = createSignal('')
  const [hasStoredKey, setHasStoredKey] = createSignal(false)
  const [tab, setTab] = createSignal<'stopping' | 'access'>('stopping')

  const getDefaultStoppingFromForm = () => {
    const s: any = (form() as any)?.settingsJson?.stopping
    return {
      hardLimit: { maxQuestions: Math.min(50, Math.max(1, Number(s?.hardLimit?.maxQuestions ?? 10))) },
      llmMayEnd: Boolean(s?.llmMayEnd ?? true),
      endReasons: Array.isArray(s?.endReasons) && s.endReasons.length > 0 ? s.endReasons : ['enough_info', 'trolling'],
    }
  }

  createEffect(() => {
    if (form() && !stopping())
      setStopping(getDefaultStoppingFromForm())
    // Track if a key is present on the form (we never show the raw key)
    if (form())
      setHasStoredKey(Boolean((form() as any)?.hasProviderKey))
  })

  const handleSaveStopping = async () => {
    const s = stopping()
    if (!s)
      return
    await saveStopping({ formId: id(), stopping: s })
    await revalidate([getForm.key])
  }

  const saveStoppingDebounced = debounce(() => {
    untrack(() => handleSaveStopping())
  }, 600)

  createEffect(() => {
    if (form() === null)
      nav('/forms')
  })

  const handleTogglePublish = async () => {
    const status = form()?.status
    if (status === 'published')
      await unpublish({ formId: id() })
    else
      await publish({ formId: id() })
    await revalidate([getForm.key])
  }

  const handleShare = async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    // TODO: switch to slug when available on the form
    const url = `${base}/r/${id()}`
    try {
      await navigator.clipboard.writeText(url)
    }
    catch {}
  }

  const getInputFormId = (input: unknown): string | undefined => {
    const arg: any = Array.isArray(input) ? input[0] : input
    if (!arg)
      return undefined
    if (typeof arg === 'string')
      return arg
    return arg.formId
  }

  const isPublishing = () => publishSubs.values().some(s => s.pending && getInputFormId(s.input) === id())
  const isUnpublishing = () => unpublishSubs.values().some(s => s.pending && getInputFormId(s.input) === id())
  const optimisticStatus = () => {
    if (isPublishing())
      return 'published'
    if (isUnpublishing())
      return 'draft'
    return form()?.status
  }

  const handleDelete = async () => {
    const res = await remove({ formId: id() })
    if (res?.ok)
      nav('/forms')
  }

  return (
    <AppShell>
      <section>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h1 class="min-w-0 flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span class="truncate" title={form()?.title ?? 'Form'}>{form()?.title ?? 'Form'}</span>
              <span class="shrink-0 text-sm text-muted-foreground">—</span>
              <span class="shrink-0 text-sm text-muted-foreground">{optimisticStatus()}</span>
            </h1>
            <p class="break-all text-sm text-muted-foreground">ID: {id()}</p>
          </div>
          <div class="w-full flex flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <A href={`/r/${form()?.slug || id()}`}>
              <Button size="sm" variant="outline">
                <span class="i-ph:eye-bold" />
                <span>View</span>
              </Button>
            </A>
            <Button size="sm" variant="outline" disabled={isPublishing() || isUnpublishing()} onClick={handleTogglePublish}>
              <span class={(isPublishing() || isUnpublishing()) ? 'i-svg-spinners:180-ring' : (optimisticStatus() === 'published' ? 'i-ph:cloud-slash-bold' : 'i-ph:cloud-arrow-up-bold')} />
              <span>{optimisticStatus() === 'published' ? 'Unpublish' : 'Publish'}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleShare}>
              <span class="i-ph:link-bold" />
              <span>Share link</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <span class="i-ph:trash-bold" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        <div class="relative pt-4 text-card-foreground">
          <Show when={saving() || saveStoppingSubs.values().some(s => s.pending && getInputFormId(s.input) === id())}>
            <div class="pointer-events-none absolute right-2 top-2 z-10">
              <div class="pointer-events-auto flex items-center gap-2 border rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
                <span class="i-svg-spinners:180-ring" />
                <span>Saving...</span>
              </div>
            </div>
          </Show>
          <Show when={form()} keyed fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
            {f => (
              <LLMBuilder
                form={f}
                onSavingChange={setSaving}
                settingsSlot={(
                  <div>
                    <CollapsibleCard title="Settings" defaultOpen>
                      <Tabs value={tab()} onChange={setTab} class="w-full">
                        <TabsList class="grid grid-cols-2 w-full">
                          <TabsTrigger value="stopping">Stopping Criteria</TabsTrigger>
                          <TabsTrigger value="access">Access</TabsTrigger>
                        </TabsList>

                        <TabsContent value="stopping">
                          <div class="p-3">
                            <p class="mb-4 text-sm text-muted-foreground">Control when the interview ends.</p>
                            <div class="grid gap-4 sm:grid-cols-2">
                              <div
                                class="flex flex-col gap-2"
                                onFocusOut={(e) => {
                                  const next = e.relatedTarget as Node | null
                                  const curr = e.currentTarget as HTMLDivElement
                                  if (next && curr.contains(next))
                                    return
                                  void handleSaveStopping()
                                }}
                              >
                                <label class="text-sm">Max questions (hard limit)</label>
                                <p class="text-xs text-muted-foreground">Includes the seed question.</p>
                                <NumberField
                                  class="w-full"
                                  value={stopping()?.hardLimit.maxQuestions ?? 10}
                                  onChange={(val) => {
                                    const base = (val === '' || val == null)
                                      ? 10
                                      : (typeof val === 'number' ? val : Number(val))
                                    const clamped = Math.min(50, Math.max(1, base))
                                    setStopping(s => ({ ...(s as any), hardLimit: { maxQuestions: clamped } }))
                                    saveStoppingDebounced()
                                  }}
                                  minValue={1}
                                  maxValue={50}
                                  step={1}
                                >
                                  <NumberFieldGroup>
                                    <NumberFieldInput aria-label="Max questions (includes seed)" />
                                    <NumberFieldDecrementTrigger />
                                    <NumberFieldIncrementTrigger />
                                  </NumberFieldGroup>
                                </NumberField>
                              </div>
                              <div class="flex flex-col gap-2">
                                <div class="flex items-start space-x-2">
                                  <Checkbox
                                    id="llm-may-end"
                                    checked={stopping()?.llmMayEnd ?? true}
                                    onChange={(v) => {
                                      setStopping(s => ({ ...(s as any), llmMayEnd: Boolean(v) }))
                                      void handleSaveStopping()
                                    }}
                                  />
                                  <div class="grid gap-1.5 leading-none">
                                    <Label for="llm-may-end-input">End early when appropriate</Label>
                                    <p class="text-xs text-muted-foreground">Allow the LLM to end the interview early</p>
                                  </div>
                                </div>

                                <div class="mt-3 border rounded-md p-3">
                                  <span class="mb-2 block text-xs text-muted-foreground font-medium">Early end reasons</span>
                                  <div class={`flex flex-col gap-3 ${!(stopping()?.llmMayEnd) ? 'opacity-60' : ''}`}>
                                    <div class="flex items-start space-x-2">
                                      <Checkbox
                                        id="reason-enough-info"
                                        disabled={!stopping()?.llmMayEnd}
                                        checked={Boolean(stopping()?.endReasons.includes('enough_info'))}
                                        onChange={(v) => {
                                          setStopping((s) => {
                                            const next = new Set((s?.endReasons ?? []) as any)
                                            if (v)
                                              next.add('enough_info')
                                            else next.delete('enough_info')
                                            const arr = Array.from(next)
                                            return { ...(s as any), endReasons: arr as any }
                                          })
                                          void handleSaveStopping()
                                        }}
                                      />
                                      <div class="grid gap-1.5 leading-none">
                                        <Label for="reason-enough-info-input">Enough info</Label>
                                        <p class="text-xs text-muted-foreground">End early when you have sufficient signal.</p>
                                      </div>
                                    </div>
                                    <div class="flex items-start space-x-2">
                                      <Checkbox
                                        id="reason-trolling"
                                        disabled={!stopping()?.llmMayEnd}
                                        checked={Boolean(stopping()?.endReasons.includes('trolling'))}
                                        onChange={(v) => {
                                          setStopping((s) => {
                                            const next = new Set((s?.endReasons ?? []) as any)
                                            if (v)
                                              next.add('trolling')
                                            else next.delete('trolling')
                                            const arr = Array.from(next)
                                            return { ...(s as any), endReasons: arr as any }
                                          })
                                          void handleSaveStopping()
                                        }}
                                      />
                                      <div class="grid gap-1.5 leading-none">
                                        <Label for="reason-trolling-input">Respondent trolling</Label>
                                        <p class="text-xs text-muted-foreground">Stop if responses are clearly low-signal.</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="access">
                          <div class="p-3">
                            <h2 class="text-sm font-semibold">Respondent Access</h2>
                            <p class="mb-3 text-sm text-muted-foreground">Choose how respondents can access this form. Invites are always allowed if you generate them. Optionally allow anyone to complete by signing in.</p>

                            <div class="mb-6 flex items-start space-x-2">
                              <Checkbox
                                id="allow-oauth-respondents"
                                checked={Boolean(((f as any).settingsJson as any)?.access?.allowOAuth ?? true)}
                                onChange={(v) => {
                                  // Persist into settingsJson.access.allowOAuth
                                  void saveAccess({ formId: id(), access: { allowOAuth: Boolean(v) } })
                                    .then(() => revalidate([getForm.key]))
                                }}
                              />
                              <div class="grid gap-1.5 leading-none">
                                <Label for="allow-oauth-respondents">Allow anyone to complete by signing in</Label>
                                <p class="text-xs text-muted-foreground">If disabled, respondents must use a single-use invite link. If enabled, either invites or OAuth can be used.</p>
                              </div>
                            </div>

                            <h3 class="text-sm font-semibold">Provider API key</h3>
                            <p class="mb-2 text-sm text-muted-foreground">Stored encrypted on the server and used when respondents answer this form. It's never exposed to the respondent's browser.</p>
                            <div>
                              <Show
                                when={!hasStoredKey()}
                                fallback={(
                                  <div class="h-10 flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3">
                                    <p class="text-sm">API Key saved</p>
                                    <Button variant="ghost" size="icon" onClick={() => { void clearKey({ formId: id() }).then(() => revalidate([getForm.key])) }}>
                                      <span class="i-ph:trash-duotone size-5" />
                                    </Button>
                                  </div>
                                )}
                              >
                                <form
                                  class="flex items-center gap-2"
                                  onSubmit={(e) => {
                                    e.preventDefault()
                                    const v = providerKeyInput().trim()
                                    if (v.length === 0)
                                      return
                                    void saveKey({ formId: id(), apiKey: v }).then(async () => {
                                      setProviderKeyInput('')
                                      await revalidate([getForm.key])
                                    })
                                  }}
                                >
                                  <input
                                    type="password"
                                    autocomplete="off"
                                    placeholder="Paste provider API key"
                                    class="h-10 w-full flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none"
                                    value={providerKeyInput()}
                                    onInput={e => setProviderKeyInput((e.currentTarget as HTMLInputElement).value)}
                                  />
                                  <Button type="submit" size="sm">Save</Button>
                                </form>
                              </Show>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CollapsibleCard>
                  </div>
                )}
              />
            )}
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
