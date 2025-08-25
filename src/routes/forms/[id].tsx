import type { RouteDefinition } from '@solidjs/router'
import type { VoidComponent } from 'solid-js'
import { Protected } from '@rttnd/gau/client/solid'
import { debounce } from '@solid-primitives/scheduled'
import { A, createAsync, revalidate, useAction, useNavigate, useParams, useSubmissions } from '@solidjs/router'
import { createMemo, createSignal, onMount, Show, untrack } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import CollapsibleCard from '~/components/CollapsibleCard'
import { LLMBuilder } from '~/components/forms/LLMBuilder'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput } from '~/components/ui/number-field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { clearFormProviderKey, deleteForm, getForm, publishForm, saveFormAccess, saveFormProviderKey, saveFormSlug, saveFormStopping, unpublishForm } from '~/server/forms'
import { useUIStore } from '~/stores/ui'

export const route = {
  preload({ params }) {
    return getForm({ formId: params.id })
  },
} satisfies RouteDefinition

export default Protected(() => <FormDetail />, '/')

function FormDetail() {
  const { ui, actions } = useUIStore()
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
  const saveSlug = useAction(saveFormSlug)
  const form = createAsync(() => getForm({ formId: id() }))
  const [saving, setSaving] = createSignal(false)
  const [stopping, setStopping] = createSignal<{ hardLimit?: { maxQuestions: number }, llmMayEnd?: boolean, endReasons?: Array<'enough_info' | 'trolling'>, allowRespondentComplete?: boolean }>()
  const [providerKeyInput, setProviderKeyInput] = createSignal('')
  const tab = createMemo<'access' | 'stopping'>(() => ui.formsUi?.[id()]?.settingsTab ?? 'access')
  const hasStoredKey = createMemo(() => Boolean(form()?.hasProviderKey))

  const getDefaultStoppingFromForm = () => {
    const s = form()?.settingsJson?.stopping
    return {
      hardLimit: { maxQuestions: Math.min(50, Math.max(1, Number(s?.hardLimit?.maxQuestions ?? 10))) },
      llmMayEnd: Boolean(s?.llmMayEnd ?? true),
      endReasons: Array.isArray(s?.endReasons) && s.endReasons.length > 0 ? s.endReasons : ['enough_info', 'trolling'],
      allowRespondentComplete: Boolean((s as any)?.allowRespondentComplete ?? false),
    }
  }

  const defaultStopping = createMemo(() => getDefaultStoppingFromForm())
  const effectiveStopping = createMemo(() => {
    const base = defaultStopping()
    const curr = stopping()
    if (!curr)
      return base
    return {
      ...base,
      ...curr,
      hardLimit: { ...base.hardLimit, ...(curr.hardLimit || {}) },
    }
  })

  const NullRedirector: VoidComponent = () => {
    onMount(() => {
      nav('/forms')
    })
    return null
  }

  const handleSaveStopping = async () => {
    const s = effectiveStopping()
    if (!s)
      return
    await saveStopping({ formId: id(), stopping: s as any })
    await revalidate([getForm.key])
  }

  const saveStoppingDebounced = debounce(() => {
    untrack(() => handleSaveStopping())
  }, 600)

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
    const url = `${base}/r/${form()?.slug || id()}`
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
              <span>Copy link</span>
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
          <Show when={form() === null}>
            <NullRedirector />
          </Show>
          <Show when={form()} keyed fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
            {f => (
              <LLMBuilder
                form={f}
                onSavingChange={setSaving}
                settingsSlot={(
                  <div>
                    <CollapsibleCard
                      title="Settings"
                      defaultOpen
                      open={ui.formsUi?.[id()]?.settingsOpen}
                      onOpenChange={open => actions.setFormSettingsOpen(id(), open)}
                    >
                      <Tabs
                        value={tab()}
                        onChange={(v) => {
                          actions.setFormSettingsTab(id(), v as 'access' | 'stopping')
                        }}
                        class="w-full"
                      >
                        <TabsList class="grid grid-cols-2 w-full">
                          <TabsTrigger value="access">Access</TabsTrigger>
                          <TabsTrigger value="stopping">Stopping Criteria</TabsTrigger>
                        </TabsList>
                        <TabsContent value="access">
                          <div class="p-3">
                            <h2 class="text-sm font-semibold">Respondent Access</h2>
                            <p class="mb-3 text-sm text-muted-foreground">Choose how respondents can access this form. Invites are always allowed if you generate them. Optionally allow anyone to complete by signing in.</p>

                            <div class="mb-6 flex items-start space-x-2">
                              <Checkbox
                                id="allow-oauth-respondents"
                                checked={Boolean(f?.settingsJson?.access?.allowOAuth ?? true)}
                                onChange={(v) => {
                                  void saveAccess({ formId: id(), access: { allowOAuth: Boolean(v) } })
                                    .then(() => revalidate([getForm.key]))
                                }}
                              />
                              <div class="grid gap-1.5 leading-none">
                                <Label for="allow-oauth-respondents">Allow anyone to submit by signing in</Label>
                                <p class="text-xs text-muted-foreground">If disabled, respondents must use a single-use invite link. If enabled, either invites or signing in can be used, or both.</p>
                              </div>
                            </div>

                            <div class="mb-6">
                              <label class="text-sm font-medium">Respondent back steps</label>
                              <p class="mb-2 text-xs text-muted-foreground">Allow respondents to go back and change their last answer. Owners always have full controls.</p>
                              <form
                                class="flex items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  const input = e.currentTarget.querySelector('input[name=respondentBackLimit]') as HTMLInputElement | null
                                  const v = Number((input?.value ?? '').trim())
                                  const value = Number.isFinite(v) ? Math.max(0, Math.min(10, Math.trunc(v))) : 0
                                  void saveAccess({ formId: id(), access: { respondentBackLimit: value } })
                                    .then(() => revalidate([getForm.key]))
                                }}
                              >
                                <input
                                  type="number"
                                  name="respondentBackLimit"
                                  min={0}
                                  max={10}
                                  step={1}
                                  class="h-10 w-28 flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none"
                                  value={Number(f?.settingsJson?.access?.respondentBackLimit ?? 0)}
                                  onInput={() => { /* local optimistic UI handled by form refresh */ }}
                                />
                                <Button type="submit" size="sm">Save</Button>
                              </form>
                            </div>

                            <div class="mb-4">
                              <label class="text-sm font-medium">Public name (slug)</label>
                              <p class="mb-2 text-xs text-muted-foreground">Used in the URL. Only lowercase letters, numbers and hyphens. Example: <code class="code">/r/my-form</code></p>
                              <form
                                class="flex items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  const input = e.currentTarget.querySelector('input[name=slug]') as HTMLInputElement | null
                                  const value = (input?.value || '').trim()
                                  void saveSlug({ formId: id(), slug: value }).then(async () => {
                                    await revalidate([getForm.key])
                                  }).catch((err) => {
                                    console.error('Save slug failed', err)
                                  })
                                }}
                              >
                                <input
                                  type="text"
                                  name="slug"
                                  placeholder="my-form-name"
                                  class="h-10 w-full flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none"
                                  value={form()?.slug || ''}
                                  onInput={() => {
                                    // optimistic local reflect only
                                  }}
                                />
                                <Button type="submit" size="sm">Save</Button>
                              </form>
                              <Show when={form()?.slug}>
                                <p class="mt-2 text-xs text-muted-foreground">Preview: <code class="code">/r/{form()?.slug}</code></p>
                              </Show>
                            </div>

                            <h3 class="text-sm font-semibold">Provider API key</h3>
                            <p class="mb-2 text-sm text-muted-foreground">
                              Stored encrypted on the server and used when respondents answer this form. It's never exposed to the respondent's browser.
                            </p>
                            <Show when={f?.aiConfigJson?.provider === 'formate'}>
                              <div class="mb-2 border rounded-md bg-muted/20 p-2 text-xs text-muted-foreground">
                                Formate provider uses a server-managed LLM api key. No key is needed here.
                              </div>
                            </Show>
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
                                    const currentProvider = f?.aiConfigJson?.provider
                                    if (currentProvider === 'formate')
                                      return
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
                                    disabled={f?.aiConfigJson?.provider === 'formate'}
                                  />
                                  <Button type="submit" size="sm" disabled={f?.aiConfigJson?.provider === 'formate'}>Save</Button>
                                </form>
                              </Show>
                            </div>
                          </div>
                        </TabsContent>
                        <TabsContent value="stopping">
                          <div class="p-3">
                            <p class="mb-4 text-sm text-muted-foreground">Control when the interview ends.</p>
                            <div class="grid gap-4 sm:grid-cols-2">
                              <div
                                class="flex flex-col gap-10"
                                onFocusOut={(e) => {
                                  const next = e.relatedTarget as Node | null
                                  const curr = e.currentTarget as HTMLDivElement
                                  if (next && curr.contains(next))
                                    return
                                  void handleSaveStopping()
                                }}
                              >
                                <div class="flex flex-col gap-2">
                                  <label class="text-sm">Max questions (hard limit)</label>
                                  <p class="text-xs text-muted-foreground">Includes the seed question.</p>
                                  <NumberField
                                    class="w-full"
                                    value={effectiveStopping().hardLimit.maxQuestions}
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

                                <div class="flex items-start space-x-2">
                                  <Checkbox
                                    id="respondent-complete"
                                    checked={Boolean((effectiveStopping() as any).allowRespondentComplete ?? false)}
                                    onChange={(v) => {
                                      setStopping(s => ({ ...(s as any), allowRespondentComplete: Boolean(v) }))
                                      void handleSaveStopping()
                                    }}
                                  />
                                  <div class="grid gap-1.5 leading-none">
                                    <Label for="respondent-complete">Show "Complete" button to respondents</Label>
                                    <p class="text-xs text-muted-foreground">Let respondents finish anytime. Owner always has full controls.</p>
                                  </div>
                                </div>
                              </div>
                              <div class="flex flex-col gap-2">
                                <div class="flex items-start space-x-2">
                                  <Checkbox
                                    id="llm-may-end"
                                    checked={effectiveStopping().llmMayEnd}
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
                                  <div class={`flex flex-col gap-3 ${!(effectiveStopping().llmMayEnd) ? 'opacity-60' : ''}`}>
                                    <div class="flex items-start space-x-2">
                                      <Checkbox
                                        id="reason-enough-info"
                                        disabled={!effectiveStopping().llmMayEnd}
                                        checked={Boolean(effectiveStopping().endReasons.includes('enough_info'))}
                                        onChange={(v) => {
                                          setStopping((s) => {
                                            const next = new Set((s?.endReasons ?? []))
                                            if (v)
                                              next.add('enough_info')
                                            else next.delete('enough_info')
                                            const arr = Array.from(next)
                                            return { ...(s as any), endReasons: arr }
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
                                        disabled={!effectiveStopping().llmMayEnd}
                                        checked={Boolean(effectiveStopping().endReasons.includes('trolling'))}
                                        onChange={(v) => {
                                          setStopping((s) => {
                                            const next = new Set((s?.endReasons ?? []))
                                            if (v)
                                              next.add('trolling')
                                            else next.delete('trolling')
                                            const arr = Array.from(next)
                                            return { ...(s as any), endReasons: arr }
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
