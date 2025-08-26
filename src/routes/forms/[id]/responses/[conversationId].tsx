import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, useParams } from '@solidjs/router'
import { createMemo, For, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { getConversationTranscript } from '~/server/conversations'
import { getForm } from '~/server/forms'

export const route = {
  preload({ params }) {
    return getForm({ formId: params.id })
  },
} satisfies RouteDefinition

export default function Transcript() {
  const params = useParams()
  const formId = createMemo(() => params.id)
  const conversationId = createMemo(() => params.conversationId)
  const form = createAsync(() => getForm({ formId: formId() }))
  const data = createAsync(() => getConversationTranscript({ conversationId: conversationId() }))

  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Transcript</h1>
            <p class="text-sm text-muted-foreground">{form()?.title ?? 'Form'}</p>
          </div>
          <A href={`/forms/${formId()}/responses`} class="inline-flex">
            <Button variant="outline" size="sm">
              <span class="i-ph:arrow-left-bold" />
              <span>Back to responses</span>
            </Button>
          </A>
        </div>

        <Show when={data()} fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
          <div class="mb-4 text-xs text-muted-foreground">
            <span>Status: {(data() as any)?.conversation?.status}</span>
            <span class="mx-2 opacity-60">•</span>
            <span>Started {new Date(((data() as any)?.conversation?.startedAt) as any).toLocaleString()}</span>
            <Show when={(data() as any)?.conversation?.completedAt}>
              <span class="mx-2 opacity-60">•</span>
              <span>Completed {new Date(((data() as any)?.conversation?.completedAt) as any).toLocaleString()}</span>
            </Show>
          </div>

          <div class="space-y-3">
            <For each={(data() as any)?.turns ?? []}>
              {(t: any) => (
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
