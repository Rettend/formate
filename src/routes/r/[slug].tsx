import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, revalidate, useAction, useParams } from '@solidjs/router'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { useAuth } from '~/lib/auth'
import { completeConversation, getOrCreateConversation, listMessages, sendMessage } from '~/server/conversations'
import { getPublicFormBySlug } from '~/server/forms'
import { initProgress, useRespondentStore } from '~/stores/respondent'

export const route = {
  preload({ params }) {
    return getPublicFormBySlug({ slug: params.slug })
  },
} satisfies RouteDefinition

export default function Respondent() {
  const auth = useAuth()
  const params = useParams()
  const slug = createMemo(() => params.slug)
  const form = createAsync(() => getPublicFormBySlug({ slug: slug() }))
  const [store, setStore] = useRespondentStore()

  const start = useAction(getOrCreateConversation)
  const send = useAction(sendMessage)
  const complete = useAction(completeConversation)

  // Namespaced state within store
  const userId = createMemo(() => auth.session().user?.id ?? 'anon')
  const formId = createMemo(() => form()?.id)
  const progress = createMemo(() => store.byForm[formId() ?? '']?.byUser[userId()] ?? undefined)
  const isOwner = createMemo(() => auth.session().user?.id && form()?.ownerUserId && auth.session().user?.id === form()?.ownerUserId)

  // Messages loader using createAsync keyed by conversationId
  const messages = createAsync(async () => {
    const convId = progress()?.conversationId
    if (!convId)
      return { items: [] as Array<{ id: string, role: string, contentText: string }> }
    return listMessages({ conversationId: convId })
  })
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const handleStart = async () => {
    setError(null)
    const f = form()
    const user = auth.session().user
    if (!f) {
      setError('Form not found or not public')
      return
    }
    if (!user) {
      // If not authed, trigger sign-in and return back
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/r/${slug()}`
      auth.signIn('github', { redirectTo: returnTo })
      return
    }
    setLoading(true)
    try {
      const conv = await start({ formId: f.id })
      if (conv?.id) {
        // initialize progress container if missing
        initProgress(setStore, f.id, user.id)
        setStore('byForm', f.id, 'byUser', user.id, 'conversationId', conv.id)
        await revalidate([listMessages.key])
      }
    }
    catch (e) {
      console.error('Failed to start conversation:', e)
      setError(e instanceof Error ? e.message : 'Failed to start')
    }
    finally {
      setLoading(false)
    }
  }

  const currentField = createMemo(() => {
    const f = form()
    const p = progress()
    const idx = p?.currentIndex ?? 0
    return f?.settingsJson?.fields?.[idx]
  })

  const canSubmit = createMemo(() => Boolean(progress()?.conversationId && currentField()))

  const handleSubmit = async () => {
    setError(null)
    const convId = progress()?.conversationId
    const field = currentField()
    if (!convId || !field)
      return

    const value = (document.getElementById('answer') as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''

    setLoading(true)
    try {
      await send({ conversationId: convId, fieldId: field.id, value })
      const f = form()!
      const uid = userId()
      setStore('byForm', f.id, 'byUser', uid, 'answers', field.id, value)
      setStore('byForm', f.id, 'byUser', uid, 'currentIndex', (progress()?.currentIndex ?? 0) + 1)
      await revalidate([listMessages.key])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    }
    finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    const convId = progress()?.conversationId
    if (convId)
      await complete({ conversationId: convId })
  }

  const FieldInput = () => (
    <Show when={currentField()} fallback={<p class="text-sm text-muted-foreground">No more questions. You can complete the form.</p>}>
      <>
        <Show when={currentField()?.type === 'long_text'}>
          <textarea id="answer" rows={4} class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={currentField()?.label} />
        </Show>
        <Show when={currentField()?.type === 'number'}>
          <input id="answer" type="number" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={currentField()?.label} />
        </Show>
        <Show when={currentField()?.type === 'date'}>
          <input id="answer" type="date" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        </Show>
        <Show when={['short_text', 'multiple_choice', 'checkbox', 'rating'].includes(currentField()?.type as string)}>
          <input id="answer" type="text" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={currentField()?.label} />
        </Show>
      </>
    </Show>
  )

  return (
    <AppShell requireAuth={false} showSidebar={Boolean(isOwner())}>
      <section class="mx-auto max-w-3xl min-h-[70vh] flex items-center justify-center">
        <Show when={form()} fallback={<p class="text-sm text-muted-foreground">Loading...</p>}>
          {f => (
            <div class="w-full">
              <header class="mb-6 text-center space-y-1">
                <h1 class="text-2xl font-semibold tracking-tight">{f().title}</h1>
                <Show when={f()?.description}>
                  <p class="text-sm text-muted-foreground">{f()?.description}</p>
                </Show>
              </header>

              <div class="mx-auto max-w-md border rounded-lg bg-card p-5 text-center text-card-foreground space-y-4">
                <Show
                  when={auth.session().user}
                  fallback={(
                    <>
                      <p class="text-sm">Sign in to start this form.</p>
                      <div class="flex justify-center gap-2">
                        <Button size="sm" variant="default" onClick={() => handleStart()} disabled={loading()}>
                          <span class={loading() ? 'i-svg-spinners:180-ring' : 'i-ph:sign-in-bold'} />
                          <span>{loading() ? 'Redirecting…' : 'Sign in & Start'}</span>
                        </Button>
                      </div>
                    </>
                  )}
                >
                  <>
                    <p class="text-sm text-muted-foreground">Signed in as {auth.session().user?.email}</p>
                    <div class="flex justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => auth.signOut()}>Switch account</Button>
                      <Button size="sm" variant="default" onClick={() => handleStart()} disabled={loading()}>
                        <span class={loading() ? 'i-svg-spinners:180-ring' : 'i-ph:play-bold'} />
                        <span>{progress()?.conversationId ? 'Resume' : 'Start'}</span>
                      </Button>
                    </div>
                  </>
                </Show>

                <Show when={isOwner()}>
                  <div class="flex justify-center gap-2 pt-2">
                    <A href={`/forms/${f().id}`}>
                      <Button size="sm" variant="outline">
                        <span class="i-ph:arrow-left-bold" />
                        <span>Back to form</span>
                      </Button>
                    </A>
                  </div>
                </Show>
              </div>

              <Show when={progress()?.conversationId}>
                <div class="grid mt-8 gap-4 md:grid-cols-[1fr_1fr]">
                  <div class="space-y-3">
                    <h2 class="text-sm font-medium">Messages</h2>
                    <div class="min-h-40 border rounded-lg bg-card p-3 text-card-foreground space-y-2">
                      <For each={messages()?.items ?? []}>
                        {m => (
                          <div class={m.role === 'user' ? 'text-right' : ''}>
                            <span class={m.role === 'user' ? 'inline-block bg-primary text-primary-foreground rounded px-2 py-1 text-sm' : 'inline-block bg-muted rounded px-2 py-1 text-sm'}>
                              {m.contentText}
                            </span>
                          </div>
                        )}
                      </For>
                      <Show when={loading()}>
                        <div class="text-xs text-muted-foreground">Sending…</div>
                      </Show>
                    </div>
                  </div>

                  <div class="space-y-3">
                    <h2 class="text-sm font-medium">Your answer</h2>
                    <div class="border rounded-lg bg-card p-3 text-card-foreground space-y-3">
                      <Show when={currentField()} fallback={<p class="text-sm text-muted-foreground">All done!</p>}>
                        <>
                          <FieldInput />
                          <div class="flex gap-2">
                            <Button size="sm" variant="default" onClick={() => handleSubmit()} disabled={!canSubmit() || loading()}>
                              <span class={loading() ? 'i-svg-spinners:180-ring' : 'i-ph:paper-plane-tilt-bold'} />
                              <span>{loading() ? 'Sending…' : 'Submit'}</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleComplete}>
                              Complete
                            </Button>
                          </div>
                        </>
                      </Show>
                    </div>
                  </div>
                </div>
              </Show>

              <Show when={error()}>
                <div class="mt-4 text-sm text-destructive">{error()}</div>
              </Show>
            </div>
          )}
        </Show>
      </section>
    </AppShell>
  )
}
