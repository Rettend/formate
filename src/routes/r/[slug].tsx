import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, revalidate, useAction, useNavigate, useParams } from '@solidjs/router'
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show, Suspense } from 'solid-js'
import { produce } from 'solid-js/store'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import FieldInput from '~/components/fields/FieldInput'
import { ModelRatingDisplay } from '~/components/ModelRatings'
import { SignInCard } from '~/components/SignInCard'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Skeleton } from '~/components/ui/skeleton'
import { getModelAlias, models, providers } from '~/lib/ai/lists'
import { useAuth } from '~/lib/auth'
import { answerQuestion, completeConversation, getOrCreateConversation, listTurns, resetConversation, respondentRewind, rewindOneStep } from '~/server/conversations'
import { getPublicFormBySlug } from '~/server/forms'
import { redeemInvite, resolveInviteCode } from '~/server/invites'
import { initProgress, useRespondentLocalStore, useRespondentSessionStore } from '~/stores/respondent'

export const route = {
  preload({ params }) {
    return getPublicFormBySlug({ slug: params.slug })
  },
} satisfies RouteDefinition

export default function Respondent() {
  const auth = useAuth()
  const params = useParams()
  const slug = createMemo(() => params.slug)

  const [form] = createResource(() => slug(), (s: string) => getPublicFormBySlug({ slug: s }))

  const nav = useNavigate()
  const [local, setLocal] = useRespondentLocalStore()
  const start = useAction(getOrCreateConversation)
  const answer = useAction(answerQuestion)
  const rewind = useAction(rewindOneStep)
  const rewindRespondent = useAction(respondentRewind)
  const reset = useAction(resetConversation)
  const complete = useAction(completeConversation)
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
  const progress = createMemo(() => local.byForm[formId() ?? '']?.byUser?.[userId()] ?? undefined)
  const isOwner = createMemo(() => auth.session().user?.id && form()?.ownerUserId && auth.session().user?.id === form()?.ownerUserId)

  const [loading, setLoading] = createSignal(false)
  const [autoStartTriggered, setAutoStartTriggered] = createSignal(false)
  const [redeemed, setRedeemed] = createSignal(false)
  const [redeemStarted, setRedeemStarted] = createSignal(false)
  const [redeemAlreadyUsed, setRedeemAlreadyUsed] = createSignal(false)
  const [inviteInput, setInviteInput] = createSignal('')
  const [inviteHandled, setInviteHandled] = createSignal(false)
  const [session, setSession] = useRespondentSessionStore()
  const [prefillByTurnId, setPrefillByTurnId] = createSignal<Record<string, unknown>>({})
  const [confirmCompleteOpen, setConfirmCompleteOpen] = createSignal(false)

  function hasInviteCookie(fid?: string | null): boolean {
    if (!fid || typeof document === 'undefined')
      return false
    try {
      const name = `form_invite_${fid}=`
      const found = document.cookie.split('; ').some(c => c.startsWith(name))
      return found
    }
    catch {
      return false
    }
  }

  // Turns keyed by conversationId
  const turnsResult = createAsync(async () => {
    const convId = progress()?.conversationId
    if (!convId)
      return { items: [] as Array<{ id: string, index: number, status: string, questionJson: any, answerJson?: any }>, remainingBack: null as number | null }
    const res = await listTurns({ conversationId: convId })
    // If conversation was deleted server-side, clear local state and inform user
    if (res?.status === 'deleted') {
      const f = form()
      if (f) {
        const key = userId()
        initProgress(setLocal, f.id, key)
        setLocal('byForm', f.id, 'byUser', key, 'conversationId', undefined)
      }
      queueMicrotask(() => toast.message('This session ended. You can start again.'))
      return { items: [], remainingBack: null as number | null, status: 'deleted' as const }
    }
    if (!isOwner() && typeof res?.remainingBack === 'number') {
      setSession('byConversation', convId, prev => prev ?? ({}))
      setSession('byConversation', convId, 'backRemaining', res.remainingBack)
    }
    return res
  })
  const turns = createMemo(() => turnsResult()?.items ?? [])
  const conversationStatus = createMemo(() => (turnsResult() as any)?.status as string | undefined)
  const isCompleted = createMemo(() => conversationStatus() === 'completed')
  const activeTurn = createMemo(() => turns().find(t => t.status === 'awaiting_answer'))
  const canSubmit = createMemo(() => Boolean(progress()?.conversationId && activeTurn() && !isCompleted()))

  const conversationId = createMemo(() => progress()?.conversationId)
  const backRemaining = createMemo<number | null>(() => {
    if (isOwner())
      return null
    const cid = conversationId()
    if (!cid)
      return null
    const v = session.byConversation[cid]?.backRemaining
    return typeof v === 'number' ? v : null
  })

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
        initProgress(setLocal, f.id, key)
        setLocal('byForm', f.id, 'byUser', key, 'conversationId', conv.id)
        // Initialize remaining back steps optimistically for respondents if configured
        if (!isOwner()) {
          const limit = Number((((form() as any)?.settingsJson as any)?.access?.respondentBackLimit ?? 0))
          const initVal = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0
          const cid = conv.id
          setSession('byConversation', cid, prev => prev ?? ({}))
          setSession('byConversation', cid, 'backRemaining', initVal)
        }
        await revalidate([listTurns.key])
        // Clear any pending invite-related hints once we successfully start
        try {
          if (typeof window !== 'undefined')
            window.sessionStorage?.removeItem(`invite_redeem_used_${f.id}`)
        }
        catch {}
        try {
          if (typeof window !== 'undefined')
            window.sessionStorage?.removeItem(`invite_redeemed_for_${f.id}`)
        }
        catch {}
      }
    }
    catch (e) {
      console.error('Failed to start conversation:', e)
      const msg = e instanceof Error ? e.message : String(e)
      let usedHint = false
      try {
        if (typeof window !== 'undefined') {
          const k = `invite_redeem_used_${f.id}`
          usedHint = window.sessionStorage?.getItem(k) === '1'
          // Consume the hint regardless
          window.sessionStorage?.removeItem(k)
        }
      }
      catch {}
      if (usedHint && typeof msg === 'string' && msg.toLowerCase().includes('unauthorized'))
        toast.error('Invite already used')
      else
        toast.error(e instanceof Error ? e.message : 'Failed to start')
    }
    finally {
      setLoading(false)
    }
  }

  // Memo for canonical redirect condition
  const shouldRedirect = createMemo(() => {
    const f = form()
    if (!f)
      return false
    const current = slug() || ''
    const hasSlug = Boolean((f as any).slug)
    return hasSlug && current === f.id
  })

  const handleRewind = async () => {
    const convId = progress()?.conversationId
    if (!convId)
      return
    setLoading(true)
    try {
      const res = isOwner() ? await rewind({ conversationId: convId }) : await rewindRespondent({ conversationId: convId })
      if (!isOwner()) {
        const remaining = typeof (res as any)?.remaining === 'number' ? (res as any).remaining : backRemaining()
        const cid = convId
        if (cid) {
          setSession('byConversation', cid, prev => prev ?? ({}))
          setSession('byConversation', cid, 'backRemaining', remaining ?? 0)
        }
      }
      await revalidate([listTurns.key])
      queueMicrotask(() => {
        const targetId = res?.reopenedTurnId ? `#answer-${res.reopenedTurnId}` : '[data-active-turn] textarea, [data-active-turn] input'
        const next = document.querySelector(targetId) as HTMLInputElement | HTMLTextAreaElement | null
        if (res?.reopenedTurnId)
          setPrefillByTurnId(prev => ({ ...prev, [res.reopenedTurnId!]: (res as any)?.previousAnswer }))
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
      setLocal('draftsByConversation', prev => prev ?? ({}))
      setLocal('draftsByConversation', convId, prev => prev ?? ({}))
      setLocal('draftsByConversation', convId, produce((byKey) => {
        const fieldId = (turn as any)?.questionJson?.id
        const k = `${turn.id}:${fieldId}`
        delete (byKey as any)[k]
      }))
      setPrefillByTurnId((prev) => {
        const { [turn.id]: _removed, ...rest } = prev
        return rest
      })
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
  const handleComplete = async () => {
    setConfirmCompleteOpen(false)
    const convId = progress()?.conversationId
    if (!convId)
      return
    setLoading(true)
    try {
      await complete({ conversationId: convId })
      await revalidate([listTurns.key])
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete')
    }
    finally {
      setLoading(false)
    }
  }

  // Listen for custom submit event fired by FieldInput on Enter
  onMount(() => {
    const handler = () => {
      if (canSubmit() && !loading())
        void handleSubmit()
    }
    document.addEventListener('submit-active-turn', handler)
    onCleanup(() => document.removeEventListener('submit-active-turn', handler))
  })

  const handleReset = async () => {
    const convId = progress()?.conversationId
    if (!convId || !isOwner())
      return
    setLoading(true)
    try {
      const res = await reset({ conversationId: convId })
      setLocal('draftsByConversation', prev => prev ?? ({}))
      setLocal('draftsByConversation', produce((all) => {
        delete (all as any)[convId]
      }))
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
    // Only accept short code via manual input now
    const base58 = /^[1-9A-HJ-NP-Za-km-z]{6,24}$/
    const code = base58.test(raw) ? raw : null
    if (!code) {
      toast.error('Enter the invite code')
      return
    }
    if (redeemStarted())
      return
    setRedeemStarted(true)
    setLoading(true)
    try {
      await redeem({ code })
      setRedeemed(true)
      // Clear any stale local conversation and ensure structure
      const f = form()
      if (f) {
        initProgress(setLocal, f.id, userId())
        setLocal('byForm', f.id, 'byUser', userId(), 'conversationId', undefined)
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
        // Try to resume if invite cookie exists in this browser; else show input
        const f = form()
        if (f)
          await handleStart()
        if (!progress()?.conversationId)
          toast.error('Invite already used')
        setRedeemStarted(false)
      }
      else {
        toast.error(e instanceof Error ? e.message : 'Invalid or used invite')
        setRedeemStarted(false)
      }
    }
    finally {
      setLoading(false)
    }
  }

  function onInviteKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!redeemStarted())
        void handleManualRedeemClick()
    }
  }

  // Sub-component for auto-starting (mounts only when conditions met)
  const AutoStarter = () => {
    onMount(() => {
      setAutoStartTriggered(true)
      void handleStart()
    })
    return null
  }

  // Sub-component for invite redemption (mounts only when form resolved to null + pattern matches)
  const InviteRedeemer = () => {
    onMount(async () => {
      if (redeemStarted())
        return
      setRedeemStarted(true)
      setLoading(true)
      try {
        const code = slug()
        await redeem({ code })
      }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (typeof msg === 'string' && msg.toLowerCase().includes('already used'))
          setRedeemAlreadyUsed(true) // Defer user messaging to canonical route
      }
      try {
        const code = slug()
        const res = await resolveInviteCode({ code })
        if (res?.formId) {
          // If we saw a used-invite error, leave a per-tab hint for the canonical route
          if (redeemAlreadyUsed()) {
            try {
              if (typeof window !== 'undefined')
                window.sessionStorage?.setItem(`invite_redeem_used_${res.formId}`, '1')
            }
            catch {}
          }
          try {
            if (typeof window !== 'undefined')
              window.sessionStorage?.setItem(`invite_redeemed_for_${res.formId}`, '1')
          }
          catch {}
          nav(`/r/${res.formId}`, { replace: true })
        }
      }
      catch (e) {
        console.error('Resolve failed:', e)
        toast.error('Failed to resolve invite code. Please try manually.')
      }
      finally {
        setRedeemStarted(false)
        setLoading(false)
        setInviteHandled(true)
      }
    })
    return null
  }

  // Sub-component for canonical redirect (mounts only when conditions met, instead of content)
  const CanonicalRedirector = () => {
    onMount(() => {
      nav(`/r/${(form() as any).slug}`, { replace: true })
    })
    return null
  }

  const base58 = /^[1-9A-HJ-NP-Za-km-z]{6,24}$/

  const allowOAuth = createMemo(() => Boolean(((form() as any)?.settingsJson as any)?.access?.allowOAuth ?? true))
  const allowRespondentComplete = createMemo(() => Boolean(((form() as any)?.settingsJson as any)?.stopping?.allowRespondentComplete ?? false))
  const requiresInviteOnly = createMemo(() => Boolean(form()) && !allowOAuth())
  const providerId = createMemo(() => (form() as any)?.aiConfigJson?.provider as string | undefined)
  const modelId = createMemo(() => (form() as any)?.aiConfigJson?.modelId as string | undefined)
  const providerTitle = createMemo(() => providers.find(p => p.id === providerId())?.title ?? (providerId() ?? ''))
  const modelConfig = createMemo(() => {
    const pid = providerId() as any
    const mid = modelId()
    if (!pid || !mid)
      return undefined
    const list = (models as any)[pid] as any[] | undefined
    return list?.find(m => m.value === mid)
  })
  const inviteRedeemedHint = createMemo(() => {
    try {
      if (typeof window !== 'undefined' && formId())
        return window.sessionStorage?.getItem(`invite_redeemed_for_${formId()}`) === '1'
    }
    catch {}
    return false
  })
  const showSignIn = createMemo(() => Boolean(form())
    && !auth.session().user
    && allowOAuth()
    && !progress()?.conversationId
    && !inviteRedeemedHint())

  return (
    <AppShell showSidebar={Boolean(isOwner())}>
      <section class="mx-auto max-w-3xl min-h-[70vh] py-6">
        <Suspense fallback={<div class="mx-auto max-w-md w-full"><Skeleton height={180} width={360} radius={10} /></div>}>
          <div class="w-full space-y-8">

            {/* Invite redeemer: mounts only after form resolved to null + slug is code + not handled */}
            <Show when={!form.loading && form() === null && base58.test(slug()) && !inviteHandled()}>
              <InviteRedeemer />
            </Show>

            {/* Fallback if form failed to load (e.g., after failed invite) */}
            <Show when={!form.loading && form() === null}>
              <div class="text-center text-muted-foreground">
                Form not found. If you have an invite code, enter it below.
              </div>
            </Show>

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

            {/* form readiness warning (missing provider key) */}
            <Show when={form()?.aiReason === 'missing_key'}>
              <div class="border border-red-400/60 rounded-md bg-red-50 p-3 text-red-800 dark:(border-red-400/40 bg-red-950/30 text-red-200)">
                <div class="flex flex-col items-start gap-1 text-sm leading-relaxed">
                  <div class="flex items-center gap-2">
                    <span class="i-ph:warning-bold" aria-hidden />
                    <span>
                      <b>This form isn't fully configured:</b>
                      {' '}
                      no LLM API key is set. Please contact the form creator.
                    </span>
                  </div>
                  <Show when={isOwner()}>
                    <div class="flex items-center gap-2">
                      <span class="i-ph:wrench-bold" aria-hidden />
                      <span class="mt-1 block opacity-90">Tip: add a provider API key in the form's settings.</span>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            {/* Header: Title + Summary + Intro (with fallbacks) */}
            <div class="space-y-3">
              <h1 class="text-3xl font-bold tracking-tight md:text-4xl">{form()?.title ?? 'Form'}</h1>
              <Show when={providerId() && modelId()}>
                <div class="inline-flex items-center gap-2 border rounded-md bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                  <span class="i-ph:cpu-duotone size-4" />
                  <span>{providerTitle()}</span>
                  <span class="opacity-60">/</span>
                  <span>{modelConfig() ? getModelAlias(modelConfig() as any) : (modelId() ?? '')}</span>
                  <Show when={modelConfig()}>
                    <span class="ml-1" />
                    <ModelRatingDisplay model={modelConfig() as any} />
                  </Show>
                </div>
              </Show>
              <Show when={form()?.settingsJson?.summary}>
                <p class="text-base text-muted-foreground md:text-lg">{form()?.settingsJson?.summary}</p>
              </Show>
              <Show when={form()?.settingsJson?.intro}>
                <div class="mt-2 border rounded-md bg-muted/20 p-3 text-sm leading-relaxed">
                  {form()?.settingsJson?.intro}
                </div>
              </Show>
            </div>

            {/* Canonical redirector: mounts if needed (only when form exists) */}
            <Show when={shouldRedirect()}>
              <CanonicalRedirector />
            </Show>

            {/* Auto-starter: attempt once when we have some identity (user, invite cookie, or hint from invite redirect) */}
            <Show when={form() && !progress()?.conversationId && !autoStartTriggered() && (Boolean(auth.session().user) || hasInviteCookie(formId()) || inviteRedeemedHint())}>
              <AutoStarter />
            </Show>

            <Show when={form() && !progress()?.conversationId && !autoStartTriggered()}>
              <div class="mx-auto max-w-sm">
                <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
                  <div class="flex items-start gap-3">
                    <span class="i-ph:info-bold mt-0.5 text-muted-foreground" aria-hidden />
                    <div class="space-y-1">
                      <p class="text-sm font-medium">
                        {requiresInviteOnly()
                          ? 'This form requires an invite code to start.'
                          : 'To start, either sign in or enter an invite code.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* Auth gate: hide if invite was just redeemed or auto-starting */}
            <Show when={showSignIn()}>
              <div class="mx-auto max-w-sm">
                <SignInCard redirectTo={typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : `/r/${slug()}`} />
                <div class="mt-3 text-center text-xs text-muted-foreground">
                  Your email is not shared with the form creator.
                </div>
              </div>
            </Show>

            {/* Invite input: show whenever unauthenticated and no active conversation; also when allowOAuth is true (alongside SignInCard). Hide if invite is auto-starting or cookie exists. */}
            <Show when={form() && !auth.session().user && !redeemed() && !progress()?.conversationId && !hasInviteCookie(formId()) && !inviteRedeemedHint() && !autoStartTriggered()}>
              <div class="mx-auto max-w-sm border rounded-lg bg-card p-6 text-card-foreground shadow-sm space-y-4">
                <div class="space-y-1">
                  <h2 class="text-base font-semibold tracking-tight">Enter invite code</h2>
                  <p class="text-xs text-muted-foreground">Paste the invite code you received, or open an invite link directly</p>
                </div>
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
                    placeholder="Enter code"
                    autocomplete="one-time-code"
                  />
                  <Button size="sm" class="px-3" disabled={loading() || redeemStarted()} onClick={() => { void handleManualRedeemClick() }}>
                    <span class="i-ph:arrow-right-bold" />
                    <span class="sr-only">Redeem</span>
                  </Button>
                </div>
              </div>
            </Show>

            <Show when={progress()?.conversationId}>
              <div class="space-y-4">
                <For each={turns()}>
                  {t => (
                    <div class="border rounded-lg bg-card p-4 text-card-foreground space-y-4" data-active-turn={t.status === 'awaiting_answer' ? '' : undefined}>
                      <div>
                        <div class="text-sm font-medium"><span class="mr-2 text-muted-foreground">{(t.index ?? 0) + 1}.</span>{t.questionJson?.label}</div>
                        <Show when={t.questionJson?.helpText}>
                          <div class="text-xs text-muted-foreground">{t.questionJson?.helpText}</div>
                        </Show>
                      </div>
                      <Show when={t.status === 'answered'}>
                        <div class="mt-1 text-sm">
                          {(() => {
                            const raw = t.answerJson?.value
                            const q: any = t.questionJson
                            const opts = Array.isArray(q?.options) ? q.options : []
                            const idToLabel = new Map<string, string>(opts.map((o: any) => [o.id, o.label]))
                            const mapVals = (vals: any[]) => vals.map(v => (typeof v === 'string' ? (idToLabel.get(v) ?? v) : String(v))).join(', ')
                            if (Array.isArray(raw))
                              return mapVals(raw)
                            if (typeof raw === 'string' && raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
                              try {
                                const arr = JSON.parse(raw)
                                if (Array.isArray(arr))
                                  return mapVals(arr)
                              }
                              catch {}
                            }
                            // For single choice values, map id to label too
                            if (typeof raw === 'string' && idToLabel.has(raw))
                              return idToLabel.get(raw)
                            return typeof raw === 'string' ? raw : JSON.stringify(raw)
                          })()}
                        </div>
                      </Show>
                      <Show when={t.status === 'awaiting_answer' && !isCompleted()}>
                        <div class="space-y-4">
                          <FieldInput
                            field={t.questionJson}
                            id={`answer-${t.id}`}
                            initialAnswer={prefillByTurnId()[t.id]}
                            conversationId={progress()?.conversationId}
                          />
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <Button size="sm" variant="default" onClick={() => handleSubmit()} disabled={!canSubmit() || loading()}>
                                <span class="i-ph:paper-plane-tilt-bold" />
                                <span>{loading() ? 'Sending…' : 'Submit'}</span>
                              </Button>
                              <Show when={isOwner() || (Number((form() as any)?.settingsJson?.access?.respondentBackLimit ?? 0) > 0)}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRewind()}
                                  disabled={
                                    loading()
                                    || (!isOwner() && (backRemaining() === null || backRemaining() === 0))
                                    || ((activeTurn()?.index ?? 0) === 0)
                                  }
                                >
                                  <span class="i-ph:arrow-left-bold" />
                                  <span>Back</span>
                                </Button>
                              </Show>
                              <Show when={!isOwner() && Number((form() as any)?.settingsJson?.access?.respondentBackLimit ?? 0) > 0 && backRemaining() !== null}>
                                <div class="mr-2 text-xs text-muted-foreground">{Math.max(0, backRemaining() ?? 0)} rewinds left</div>
                              </Show>
                              <Show when={isOwner()}>
                                <Button size="sm" variant="outline" onClick={() => handleReset()} disabled={loading()}>
                                  <span class="i-ph:arrow-counter-clockwise-bold" />
                                  <span>Reset</span>
                                </Button>
                              </Show>
                              <Show when={!isOwner() && allowRespondentComplete() && !isCompleted()}>
                                <Dialog open={confirmCompleteOpen()} onOpenChange={setConfirmCompleteOpen}>
                                  <Button size="sm" variant="outline" onClick={() => setConfirmCompleteOpen(true)} disabled={loading()}>
                                    <span>End form</span>
                                  </Button>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Submit and finish?</DialogTitle>
                                      <DialogDescription>
                                        This will mark the conversation as completed.
                                        <br />
                                        You won't be able to answer more questions.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <div class="w-full flex items-center justify-end gap-2">
                                        <Button variant="ghost" onClick={() => setConfirmCompleteOpen(false)} disabled={loading()}>Cancel</Button>
                                        <Button
                                          variant="default"
                                          onClick={handleComplete}
                                          disabled={loading()}
                                        >
                                          <span>Confirm</span>
                                        </Button>
                                      </div>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </Show>
                            </div>
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
                    {auth.session().user || autoStartTriggered() ? 'Preparing first question…' : 'Sign in to start.'}
                  </div>
                </Show>
              </div>
              <Show when={(isCompleted() || !activeTurn()) && turns().length > 0}>
                <div class="space-y-3">
                  <div class="text-base text-muted-foreground md:text-lg">All done!</div>
                  <div class="mt-2 border rounded-md bg-muted/20 p-3 text-sm leading-relaxed">
                    <Show when={form()?.settingsJson?.outro}>
                      <div class="mt-1">
                        {form()?.settingsJson?.outro}
                      </div>
                    </Show>
                  </div>
                  <Show when={isOwner() || Number((form() as any)?.settingsJson?.access?.respondentBackLimit ?? 0) > 0}>
                    <div class="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleRewind()} disabled={loading() || (!isOwner() && (backRemaining() === null || backRemaining() === 0))}>
                        <span class="i-ph:arrow-left-bold" />
                        <span>Back</span>
                      </Button>
                      <Show when={!isOwner() && Number((form() as any)?.settingsJson?.access?.respondentBackLimit ?? 0) > 0 && backRemaining() !== null}>
                        <div class="text-xs text-muted-foreground">{Math.max(0, backRemaining() ?? 0)} left</div>
                      </Show>
                      <Show when={isOwner()}>
                        <Button size="sm" variant="outline" class="ml-1" onClick={() => handleReset()} disabled={loading()}>
                          <span class="i-ph:arrow-counter-clockwise-bold" />
                          <span>Reset</span>
                        </Button>
                      </Show>
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
