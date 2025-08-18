import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, revalidate, useAction, useParams } from '@solidjs/router'
import { createEffect, createMemo, createSignal, For, Show, Suspense } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import { SignInCard } from '~/components/SignInCard'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { useAuth } from '~/lib/auth'
import { answerQuestion, getOrCreateConversation, listTurns, resetConversation, rewindOneStep } from '~/server/conversations'
import { getPublicFormBySlug } from '~/server/forms'
import { redeemInvite } from '~/server/invites'
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
  const rewind = useAction(rewindOneStep)
  const reset = useAction(resetConversation)
  const redeem = useAction(redeemInvite)

  // Per-tab anonymous identity (sessionStorage)
  const getSessionAnonId = () => {
    if (typeof window === 'undefined')
      return 'anon'
    try {
      const k = 'respondent_session_id'
      let v = window.sessionStorage.getItem(k)
      if (!v) {
        v = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
        window.sessionStorage.setItem(k, v)
      }
      return v
    }
    catch {
      return 'anon'
    }
  }

  const userId = createMemo(() => auth.session().user?.id ?? getSessionAnonId())
  const formId = createMemo(() => form()?.id)
  const progress = createMemo(() => store.byForm[formId() ?? '']?.byUser?.[userId()] ?? undefined)
  const isOwner = createMemo(() => auth.session().user?.id && form()?.ownerUserId && auth.session().user?.id === form()?.ownerUserId)

  const [loading, setLoading] = createSignal(false)
  const [autoStartTriggered, setAutoStartTriggered] = createSignal(false)
  const [redeemed, setRedeemed] = createSignal(false)
  const [redeemStarted, setRedeemStarted] = createSignal(false)
  const [inviteInput, setInviteInput] = createSignal('')

  // Turns keyed by conversationId
  const turnsResult = createAsync(async () => {
    const convId = progress()?.conversationId
    if (!convId)
      return { items: [] as Array<{ id: string, index: number, status: string, questionJson: any, answerJson?: any }> }
    return listTurns({ conversationId: convId })
  })

  const turns = createMemo(() => turnsResult()?.items ?? [])
  const activeTurn = createMemo(() => turns().find(t => t.status === 'awaiting_answer'))
  const canSubmit = createMemo(() => Boolean(progress()?.conversationId && activeTurn()))

  const handleStart = async () => {
    const f = form()
    if (!f) {
      toast.error('Form not found or not public')
      return
    }
    setLoading(true)
    try {
      const conv = await start({ formId: f.id })
      if (conv?.id) {
        const key = userId()
        initProgress(setStore, f.id, key)
        setStore('byForm', f.id, 'byUser', key, 'conversationId', conv.id)
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

  // Single orchestrating effect: redeem invite token (if present) and/or auto-start
  createEffect(() => {
    const f = form()
    if (!f)
      return

    const href = typeof window !== 'undefined' ? window.location.href : `https://x/${slug()}`
    let token: string | null = null
    try {
      token = new URL(href).searchParams.get('t')
    }
    catch {
      // ignore invalid URL structure
    }

    if (token && !redeemStarted() && !redeemed()) {
      // Ensure store path exists, then clear any local conversation for this tab before redeeming
      initProgress(setStore, f.id, userId())
      setStore('byForm', f.id, 'byUser', userId(), 'conversationId', undefined)
      setRedeemStarted(true)
      ;(async () => {
        setLoading(true)
        try {
          await redeem({ token })
          setRedeemed(true)
          if (typeof window !== 'undefined') {
            const clean = new URL(window.location.href)
            clean.searchParams.delete('t')
            window.history.replaceState({}, '', clean.toString())
          }
          toast.success('Invite accepted. You can start now.')
          setAutoStartTriggered(true)
          await handleStart()
        }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (typeof msg === 'string' && msg.toLowerCase().includes('already used')) {
            setRedeemed(true)
            setAutoStartTriggered(true)
            await handleStart()
            toast.success('Invite accepted. You can start now.')
          }
          else {
            toast.error(e instanceof Error ? e.message : 'Invalid or used invite')
          }
        }
        finally {
          setLoading(false)
        }
      })()
      return
    }

    // No token: start automatically for signed-in respondents
    if (!token && Boolean(auth.session().user) && !progress()?.conversationId && !autoStartTriggered()) {
      setAutoStartTriggered(true)
      void handleStart()
    }
  })

  const handleRewind = async () => {
    const convId = progress()?.conversationId
    if (!convId || !isOwner())
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
      await revalidate([listTurns.key])
      queueMicrotask(() => {
        const next = document.querySelector('[data-active-turn] textarea, [data-active-turn] input') as HTMLInputElement | HTMLTextAreaElement | null
        next?.focus()
      })
    }
    catch (e) {
      if (e instanceof Error && typeof e.message === 'string') {
        try {
          const parsed = JSON.parse(e.message)
          if (parsed && typeof parsed === 'object') {
            const code = parsed.code as string | undefined
            const cause = typeof parsed.cause === 'string' ? parsed.cause : undefined
            if (cause)
              console.error('[AI:conv:generateFollowUp] cause:', cause)
            if (code === 'VALIDATION_FAILED') {
              toast.error('Validation failed')
              return
            }
            if (typeof parsed.message === 'string' && parsed.message.length > 0) {
              toast.error(parsed.message)
              return
            }
          }
        }
        catch {}
      }
      toast.error(e instanceof Error ? e.message : 'Failed to submit')
    }
    finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    const convId = progress()?.conversationId
    if (!convId || !isOwner())
      return

    setLoading(true)
    try {
      const res = await reset({ conversationId: convId })
      await revalidate([listTurns.key])
      queueMicrotask(() => {
        const targetId = res?.firstTurnId ? `#answer-${res.firstTurnId}` : '[data-active-turn] textarea, [data-active-turn] input'
        const next = document.querySelector(targetId) as HTMLInputElement | HTMLTextAreaElement | null
        next?.focus()
      })
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset')
    }
    finally {
      setLoading(false)
    }
  }

  // Extracted handler to avoid async function directly in JSX tracked scope
  const handleManualRedeemClick = async () => {
    const el = document.getElementById('invite-token') as HTMLInputElement | null
    const raw = (el?.value ?? inviteInput()).trim()
    const t = extractTokenFromText(raw)
    if (!t) {
      toast.error('Paste the token or a full link containing ?t=')
      return
    }
    if (redeemStarted())
      return
    setRedeemStarted(true)
    setLoading(true)
    try {
      await redeem({ token: t })
      setRedeemed(true)
      // Clear any stale local conversation and ensure structure
      const f = form()
      if (f) {
        initProgress(setStore, f.id, userId())
        setStore('byForm', f.id, 'byUser', userId(), 'conversationId', undefined)
      }
      if (el)
        el.value = ''
      setInviteInput('')
      toast.success('Invite accepted. You can start now.')
      await handleStart()
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (typeof msg === 'string' && msg.toLowerCase().includes('already used')) {
        setRedeemed(true)
        if (el)
          el.value = ''
        setInviteInput('')
        toast.success('Invite accepted. You can start now.')
        await handleStart()
      }
      else {
        toast.error(e instanceof Error ? e.message : 'Invalid or used invite')
      }
    }
    finally {
      setLoading(false)
    }
  }

  function extractTokenFromText(text: string): string | null {
    const s = (text || '').trim()
    if (!s)
      return null
    // Try URL parsing
    try {
      const url = new URL(s)
      const tok = url.searchParams.get('t')
      if (tok && tok.length > 10)
        return tok
    }
    catch {}
    // Try query substring
    if (s.includes('t=')) {
      try {
        const q = s.split('?')[1] || s
        const p = new URLSearchParams(q)
        const tok = p.get('t')
        if (tok && tok.length > 10)
          return tok
      }
      catch {}
    }
    // Fallback: JWT-ish
    if (s.split('.').length === 3 && s.length > 20)
      return s
    return null
  }

  function onInviteKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!redeemStarted())
        void handleManualRedeemClick()
    }
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

            {/* Auth gate: show sign-in only if form allows OAuth */}
            <Show when={!auth.session().user && Boolean(((form() as any)?.settingsJson as any)?.access?.allowOAuth ?? true)}>
              <div class="mx-auto max-w-sm">
                <SignInCard redirectTo={typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : `/r/${slug()}`} />
              </div>
            </Show>

            {/* Invite fallback: if OAuth disabled, show invite code input (hide after redeem) */}
            <Show when={!auth.session().user && !(((form() as any)?.settingsJson as any)?.access?.allowOAuth ?? true) && !redeemed() && !progress()?.conversationId}>
              <div class="mx-auto max-w-sm border rounded-md bg-card p-4 text-card-foreground">
                <div class="text-sm font-medium">Enter invite code</div>
                <p class="mb-2 text-xs text-muted-foreground">Paste the invite token you received. If you opened the link directly, this step isn’t needed.</p>
                <div class="flex items-center gap-2">
                  <input
                    id="invite-token"
                    type="text"
                    value={inviteInput()}
                    onInput={e => setInviteInput((e.currentTarget as HTMLInputElement).value)}
                    onKeyDown={e => onInviteKeyDown(e as unknown as KeyboardEvent)}
                    onBlur={() => {
                      if (!redeemStarted())
                        void handleManualRedeemClick()
                    }}
                    class="h-10 w-full flex border border-input rounded-md bg-background px-3 py-2 text-sm focus:outline-none"
                    placeholder="Paste token or full link"
                  />
                  <Button
                    size="sm"
                    disabled={loading() || redeemStarted()}
                    onClick={() => { void handleManualRedeemClick() }}
                  >
                    Redeem
                  </Button>
                </div>
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
                          <div class="flex items-center gap-2">
                            <Button size="sm" variant="default" onClick={() => handleSubmit()} disabled={!canSubmit() || loading()}>
                              <span class="i-ph:paper-plane-tilt-bold" />
                              <span>{loading() ? 'Sending…' : 'Submit'}</span>
                            </Button>
                            <Show when={isOwner() && (activeTurn()?.index ?? 0) > 0}>
                              <Button size="sm" variant="ghost" onClick={() => handleRewind()} disabled={loading()}>
                                <span class="i-ph:arrow-left-bold" />
                                <span>Back</span>
                              </Button>
                            </Show>
                            <Show when={isOwner()}>
                              <Button size="sm" variant="outline" onClick={() => handleReset()} disabled={loading()}>
                                <span class="i-ph:arrow-counter-clockwise-bold" />
                                <span>Reset</span>
                              </Button>
                            </Show>
                            <Show when={loading()}>
                              <span class="i-svg-spinners:180-ring size-4 text-muted-foreground" aria-hidden />
                              <span class="sr-only" aria-live="polite">Working…</span>
                            </Show>
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
                  <Show when={isOwner()}>
                    <div class="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleRewind()} disabled={loading()}>
                        <span class="i-ph:arrow-left-bold" />
                        <span>Back</span>
                      </Button>
                      <Button size="sm" variant="outline" class="ml-1" onClick={() => handleReset()} disabled={loading()}>
                        <span class="i-ph:arrow-counter-clockwise-bold" />
                        <span>Reset</span>
                      </Button>
                      <Show when={loading()}>
                        <span class="i-svg-spinners:180-ring size-4 text-muted-foreground" aria-hidden />
                        <span class="sr-only" aria-live="polite">Working…</span>
                      </Show>
                    </div>
                  </Show>
                </div>
              </Show>
            </Show>
          </div>
        </Suspense>
      </section>
    </AppShell>
  )
}
