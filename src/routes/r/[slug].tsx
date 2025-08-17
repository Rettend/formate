import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, revalidate, useAction, useParams } from '@solidjs/router'
import { createEffect, createMemo, createSignal, For, Show, Suspense } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import { SignInCard } from '~/components/SignInCard'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { useAuth } from '~/lib/auth'
import { answerQuestion, completeConversation, getOrCreateConversation, listTurns, rewindOneStep } from '~/server/conversations'
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
  const answer = useAction(answerQuestion)
  const complete = useAction(completeConversation)
  const rewind = useAction(rewindOneStep)

  // Namespaced state within store
  const userId = createMemo(() => auth.session().user?.id ?? 'anon')
  const formId = createMemo(() => form()?.id)
  const progress = createMemo(() => store.byForm[formId() ?? '']?.byUser?.[userId()] ?? undefined)
  const isOwner = createMemo(() => auth.session().user?.id && form()?.ownerUserId && auth.session().user?.id === form()?.ownerUserId)

  // Turns keyed by conversationId
  const turnsResult = createAsync(async () => {
    const convId = progress()?.conversationId
    if (!convId)
      return { items: [] as Array<{ id: string, index: number, status: string, questionJson: any, answerJson?: any }> }
    return listTurns({ conversationId: convId })
  })
  const [loading, setLoading] = createSignal(false)
  const [autoStartTriggered, setAutoStartTriggered] = createSignal(false)

  const handleStart = async () => {
    // Start/continue conversation for an authenticated user
    const f = form()
    const user = auth.session().user
    if (!f) {
      toast.error('Form not found or not public')
      return
    }
    if (!user)
      return
    setLoading(true)
    try {
      const conv = await start({ formId: f.id })
      if (conv?.id) {
        initProgress(setStore, f.id, user.id)
        setStore('byForm', f.id, 'byUser', user.id, 'conversationId', conv.id)
        await revalidate([listTurns.key])
      }
    }
    catch (e) {
      console.error('Failed to start conversation:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to start')
    }
    finally {
      setLoading(false)
    }
  }

  // Auto-start: when user is authenticated and there's no conversation yet
  createEffect(() => {
    const user = auth.session().user
    const f = form()
    if (!user || !f)
      return
    if (progress()?.conversationId)
      return
    if (autoStartTriggered())
      return
    setAutoStartTriggered(true)
    queueMicrotask(() => {
      void handleStart()
    })
  })

  // Determine the active turn (awaiting answer)
  const turns = createMemo(() => turnsResult()?.items ?? [])
  const activeTurn = createMemo(() => turns().find(t => t.status === 'awaiting_answer'))

  const canSubmit = createMemo(() => Boolean(progress()?.conversationId && activeTurn()))

  const handleRewind = async () => {
    const convId = progress()?.conversationId
    const turn = activeTurn()
    if (!convId || !turn || !isOwner() || (turn.index ?? 0) <= 0)
      return

    setLoading(true)
    try {
      const res = await rewind({ conversationId: convId })
      await revalidate([listTurns.key])
      queueMicrotask(() => {
        const targetId = res?.reopenedTurnId ? `#answer-${res.reopenedTurnId}` : '[data-active-turn] textarea, [data-active-turn] input'
        const next = document.querySelector(targetId) as HTMLInputElement | HTMLTextAreaElement | null
        next?.focus()
      })
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to go back')
    }
    finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    const convId = progress()?.conversationId
    const turn = activeTurn()
    if (!convId || !turn)
      return

    const inputEl = document.getElementById(`answer-${turn.id}`) as HTMLInputElement | HTMLTextAreaElement | null
    const value = inputEl?.value ?? ''

    setLoading(true)
    try {
      await answer({ conversationId: convId, turnId: turn.id, value })
      // Refresh turns from server
      await revalidate([listTurns.key])
      // Focus the next input when present
      queueMicrotask(() => {
        const next = document.querySelector('[data-active-turn] textarea, [data-active-turn] input') as HTMLInputElement | HTMLTextAreaElement | null
        next?.focus()
      })
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit')
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

  const FieldInput = (props: { field: any, id: string }) => (
    <>
      <Show when={props.field?.type === 'long_text'}>
        <textarea id={props.id} rows={4} class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={props.field?.label} />
      </Show>
      <Show when={props.field?.type === 'number'}>
        <input id={props.id} type="number" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={props.field?.label} />
      </Show>
      <Show when={props.field?.type === 'date'}>
        <input id={props.id} type="date" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
      </Show>
      <Show when={['short_text', 'multiple_choice', 'checkbox', 'rating'].includes(props.field?.type as string)}>
        <input id={props.id} type="text" class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" placeholder={props.field?.label} />
      </Show>
    </>
  )

  return (
    <AppShell requireAuth={false} showSidebar={Boolean(isOwner())}>
      <section class="mx-auto max-w-3xl min-h-[70vh] py-6">
        <Suspense fallback={<div class="mx-auto max-w-md w-full"><Skeleton height={180} width={360} radius={10} /></div>}>
          <div class="w-full space-y-8">
            {/* Top utility row: Back to form (owner only) */}
            <Show when={isOwner()}>
              <div class="mb-3">
                <A href={`/forms/${form()?.id}`}>
                  <Button size="sm" variant="outline">
                    <span class="i-ph:arrow-left-bold" />
                    <span>Back to form</span>
                  </Button>
                </A>
              </div>
            </Show>

            {/* Header: Title + Summary + Intro */}
            <div class="space-y-3">
              <h1 class="text-3xl font-bold tracking-tight md:text-4xl">{form()?.title ?? 'Form'}</h1>
              <Show when={form()?.settingsJson?.summary}>
                <p class="text-base text-muted-foreground md:text-lg">{form()?.settingsJson?.summary}</p>
              </Show>
              <Show when={form()?.settingsJson?.intro}>
                <div class="mt-2 border rounded-md bg-muted/20 p-3 text-sm leading-relaxed">
                  {form()?.settingsJson?.intro}
                </div>
              </Show>
            </div>

            {/* Auth gate: Logged out -> provider card; Logged in -> no card */}
            <Show when={!auth.session().user}>
              <div class="mx-auto max-w-sm">
                <SignInCard redirectTo={typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : `/r/${slug()}`} />
              </div>
            </Show>

            <Show when={progress()?.conversationId}>
              <div class="space-y-4">
                <For each={turns()}>
                  {t => (
                    <div class="border rounded-lg bg-card p-4 text-card-foreground space-y-2" data-active-turn={t.status === 'awaiting_answer' ? '' : undefined}>
                      <div>
                        <div class="text-sm font-medium">{t.questionJson?.label}</div>
                        <Show when={t.questionJson?.helpText}>
                          <div class="text-xs text-muted-foreground">{t.questionJson?.helpText}</div>
                        </Show>
                      </div>
                      <Show when={t.status === 'answered'}>
                        <div class="mt-1 text-sm">
                          {/* Render read-only answer */}
                          {(() => {
                            const v = t.answerJson?.value
                            return typeof v === 'string' ? v : JSON.stringify(v)
                          })()}
                        </div>
                      </Show>
                      <Show when={t.status === 'awaiting_answer'}>
                        <div class="space-y-2">
                          <FieldInput field={t.questionJson} id={`answer-${t.id}`} />
                          <div class="flex gap-2">
                            <Show when={isOwner() && (activeTurn()?.index ?? 0) > 0}>
                              <Button size="sm" variant="ghost" onClick={() => handleRewind()} disabled={loading()}>
                                <span class={loading() ? 'i-svg-spinners:180-ring' : 'i-ph:arrow-left-bold'} />
                                <span>Back</span>
                              </Button>
                            </Show>
                            <Button size="sm" variant="default" onClick={() => handleSubmit()} disabled={!canSubmit() || loading()}>
                              <span class={loading() ? 'i-svg-spinners:180-ring' : 'i-ph:paper-plane-tilt-bold'} />
                              <span>{loading() ? 'Sending…' : 'Submit'}</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleComplete}>
                              Complete
                            </Button>
                          </div>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={turns().length === 0}>
                  <div class="text-sm text-muted-foreground">
                    {auth.session().user ? 'Preparing first question…' : 'Sign in to start.'}
                  </div>
                </Show>
              </div>
              <Show when={!activeTurn() && turns().length > 0}>
                <div class="space-y-3">
                  <div class="text-base text-muted-foreground md:text-lg">All done!</div>
                  <div class="mt-2 border rounded-md bg-muted/20 p-3 text-sm leading-relaxed">
                    <Show when={form()?.settingsJson?.outro}>
                      <div class="mt-1">
                        {form()?.settingsJson?.outro}
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </Suspense>
      </section>
    </AppShell>
  )
}
