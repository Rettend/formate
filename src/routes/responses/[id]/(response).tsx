import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction, useNavigate, useParams } from '@solidjs/router'
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { completeConversation, deleteConversation, generateConversationSummary, getConversationTranscript, listFormConversations, reopenConversation } from '~/server/conversations'
import { getForm } from '~/server/forms'
import { useUIStore } from '~/stores/ui'

export default Protected(() => <Transcript />, '/')

function formatDuration(start: any, end: any): string {
  try {
    const s = new Date(start).getTime()
    const e = new Date(end).getTime()
    const ms = Math.max(0, e - s)
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    if (mins <= 0)
      return `${secs}s`
    return `${mins}m ${secs}s`
  }
  catch {
    return '-'
  }
}

function Transcript() {
  const { actions } = useUIStore()
  const params = useParams()
  const nav = useNavigate()
  const conversationId = createMemo(() => params.id)
  const data = createAsync(() => getConversationTranscript({ conversationId: conversationId() }))
  const markComplete = useAction(completeConversation)
  const reopen = useAction(reopenConversation)
  const [override, setOverride] = createSignal<'active' | 'completed' | null>(null)
  const optimisticStatus = () => override() ?? (data()?.conversation?.status === 'completed' ? 'completed' : 'active')
  const gen = useAction(generateConversationSummary)
  const [generating, setGenerating] = createSignal(false)
  const handleGenerate = async () => {
    const id = conversationId()
    if (!id)
      return
    try {
      setGenerating(true)
      await gen({ conversationId: id })
      await revalidate([getConversationTranscript.key])
    }
    finally {
      setGenerating(false)
    }
  }
  const handleCopy = async () => {
    const bullets = data()?.conversation?.summaryBullets ?? []
    const text = bullets.map((b: string) => `- ${b}`).join('\n')
    if (!text || text.trim().length === 0)
      return
    try {
      await navigator.clipboard.writeText(text)
    }
    catch {}
  }
  const formId = createMemo(() => data.latest?.conversation?.formId as string | undefined)
  const form = createAsync(async () => (formId() ? getForm({ formId: formId() as string }) : null))
  const remove = useAction(deleteConversation)
  const [confirming, setConfirming] = createSignal(false)
  const [confirmArmedAtMs, setConfirmArmedAtMs] = createSignal(0)
  let confirmTimer: number | undefined

  const handleDelete = async () => {
    const id = conversationId()
    if (!id)
      return
    if (confirming()) {
      if (Date.now() - confirmArmedAtMs() < 100)
        return
      const fid = formId()
      if (fid)
        actions.setSelectedForm(fid)
      nav('/responses', { replace: true })
      await remove({ conversationId: id })
      if (fid)
        await revalidate([listFormConversations.key])
      setConfirming(false)
      clearTimeout(confirmTimer)
      return
    }
    setConfirming(true)
    setConfirmArmedAtMs(Date.now())
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => setConfirming(false), 2500) as unknown as number
  }

  onCleanup(() => clearTimeout(confirmTimer))

  const handleMarkCompleted = async () => {
    const id = conversationId()
    if (!id)
      return
    setOverride('completed')
    await markComplete({ conversationId: id })
    await revalidate([getConversationTranscript.key])
    setOverride(null)
  }

  const handleReopen = async () => {
    const id = conversationId()
    if (!id)
      return
    setOverride('active')
    await reopen({ conversationId: id })
    await revalidate([getConversationTranscript.key])
    setOverride(null)
  }

  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Transcript</h1>
            <p class="text-sm text-muted-foreground">{form()?.title ?? 'Form'}</p>
          </div>
          <div class="flex items-center gap-2">
            <A
              href="/responses"
              class="inline-flex items-center gap-2 border rounded-md px-3 py-2 text-sm hover:bg-accent"
              onMouseUp={(e) => {
                if ((e.button === 0 || e.button === 1) && formId())
                  actions.setSelectedForm(formId()!)
              }}
            >
              <span class="i-ph:arrow-left-bold" />
              <span>Back to responses</span>
            </A>
            <Show when={optimisticStatus() !== 'completed'}>
              <Button
                variant="ghost"
                size="icon"
                title="Mark completed"
                aria-label="Mark completed"
                class="hover:bg-transparent"

                onClick={() => { void handleMarkCompleted() }}
              >
                <span class="i-ph:check-bold size-4" />
              </Button>
            </Show>
            <Show when={optimisticStatus() === 'completed'}>
              <Button
                variant="ghost"
                size="icon"
                title="Reopen"
                aria-label="Reopen"
                class="hover:bg-transparent"

                onClick={() => { void handleReopen() }}
              >
                <span class="i-ph:arrow-counter-clockwise-bold size-4" />
              </Button>
            </Show>
            <Button
              variant="ghost"
              size="icon"
              class="text-destructive/90 hover:bg-transparent hover:text-destructive"
              title={confirming() ? 'Click to confirm delete' : 'Delete'}
              aria-label={confirming() ? 'Confirm delete' : 'Delete'}
              onClick={() => { void handleDelete() }}
            >
              <span class={confirming() ? 'i-ph:check-bold size-4' : 'i-ph:trash-bold size-4'} />
            </Button>
          </div>
        </div>

        <Show when={form()?.id}>
          <div class="mb-4 border rounded-lg bg-card p-4 text-card-foreground">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Summary</h2>
              <div class="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  title="Copy"
                  aria-label="Copy"
                  onClick={() => { void handleCopy() }}
                  disabled={(data()?.conversation?.summaryBullets?.length ?? 0) === 0}
                >
                  <span class="i-ph:copy-bold size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => { void handleGenerate() }} disabled={generating()}>
                  <span class={generating() ? 'i-svg-spinners:180-ring size-4' : 'i-ph:arrows-clockwise-bold size-4'} />
                  <span class="ml-1">{(data()?.conversation?.summaryBullets?.length ?? 0) > 0 ? 'Regenerate' : 'Generate'}</span>
                </Button>
              </div>
            </div>
            <Show when={(data()?.conversation?.summaryBullets?.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">No summary yet.</p>}>
              <ul class="list-disc pl-5 text-sm space-y-1">
                <For each={data()?.conversation?.summaryBullets ?? []}>
                  {b => (<li>{b}</li>)}
                </For>
              </ul>
            </Show>
          </div>
        </Show>

        <Show when={data()} fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
          <div class="mb-4 text-xs text-muted-foreground">
            <span>Status: {data()?.conversation?.status}</span>
            <span class="mx-2 opacity-60">•</span>
            <span>
              Started
              {(() => {
                const d = data()?.conversation?.startedAt
                return d ? new Date(d).toLocaleString() : '—'
              })()}
            </span>
            <Show when={data()?.conversation?.completedAt}>
              <span class="mx-2 opacity-60">•</span>
              <span>
                Completed
                {(() => {
                  const d = data()?.conversation?.completedAt
                  return d ? new Date(d).toLocaleString() : '—'
                })()}
              </span>
              <span class="mx-2 opacity-60">•</span>
              <span>Duration {formatDuration(data()?.conversation?.startedAt, data()?.conversation?.completedAt)}</span>
            </Show>
            <Show when={form()?.aiConfigJson?.provider && form()?.aiConfigJson?.modelId}>
              <span class="mx-2 opacity-60">•</span>
              <span>{form()?.aiConfigJson.provider} · {form()?.aiConfigJson.modelId}</span>
            </Show>
            <Show when={data()?.conversation?.endReason}>
              <span class="mx-2 opacity-60">•</span>
              <span>End: {data()?.conversation?.endReason}</span>
            </Show>
          </div>

          <div class="space-y-3">
            <For each={data()?.turns ?? []}>
              {t => (
                <div class="border rounded-lg bg-card p-4 text-card-foreground space-y-2">
                  <div class="text-sm font-medium"><span class="mr-2 text-muted-foreground">{(t.index ?? 0) + 1}.</span>{t.questionJson?.label}</div>
                  <Show when={t.questionJson?.helpText}>
                    <div class="text-xs text-muted-foreground">{t.questionJson?.helpText}</div>
                  </Show>
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
                        if (typeof raw === 'string' && idToLabel.has(raw))
                          return idToLabel.get(raw)
                        return typeof raw === 'string' ? raw : JSON.stringify(raw)
                      })()}
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </AppShell>
  )
}
