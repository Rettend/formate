import type { RouteDefinition } from '@solidjs/router'
import { A, createAsync, revalidate, useAction, useNavigate, useParams, useSubmissions } from '@solidjs/router'
import { createEffect, createMemo, createSignal, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { LLMBuilder } from '~/components/forms/LLMBuilder'
import { Button } from '~/components/ui/button'
import { deleteForm, getForm, publishForm, unpublishForm } from '~/server/forms'

export const route = {
  preload({ params }) {
    return getForm({ formId: params.id })
  },
} satisfies RouteDefinition

export default function FormDetail() {
  const params = useParams()
  const id = createMemo(() => params.id)
  const nav = useNavigate()
  const publish = useAction(publishForm)
  const unpublish = useAction(unpublishForm)
  const publishSubs = useSubmissions(publishForm)
  const unpublishSubs = useSubmissions(unpublishForm)
  const remove = useAction(deleteForm)
  const form = createAsync(() => getForm({ formId: id() }))
  const [saving, setSaving] = createSignal(false)

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
    <AppShell requireAuth>
      <section>
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">{form()?.title ?? 'Form'}</h1>
            <p class="text-sm text-muted-foreground">ID: {id()}</p>
          </div>
          <div class="flex items-center gap-2">
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

        <div class="pt-4 text-card-foreground">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted-foreground">Status: {optimisticStatus() ?? '—'}</p>
            <Show when={saving()}>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span class="i-svg-spinners:180-ring" />
                <span>Saving…</span>
              </div>
            </Show>
          </div>
          <Show when={form()} keyed fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
            {f => (
              <LLMBuilder form={f} onSavingChange={setSaving} />
            )}
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
