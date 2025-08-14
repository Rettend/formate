import { createAsync, revalidate, useAction, useNavigate, useParams } from '@solidjs/router'
import { createEffect, Show } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { deleteForm, getForm, publishForm } from '~/server/forms'

export default function FormDetail() {
  const params = useParams()
  const id = () => params.id
  const nav = useNavigate()
  const publish = useAction(publishForm)
  const remove = useAction(deleteForm)
  const form = createAsync(() => getForm({ formId: id() }))

  createEffect(() => {
    if (form() === null)
      nav('/forms')
  })

  const handlePublish = async () => {
    await publish({ formId: id() })
    await revalidate([getForm.key])
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
            <Button
              size="sm"
              variant="outline"
              onClick={handlePublish}
            >
              Publish
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>

        <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm">
          <Show when={form()} fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
            <p class="text-sm text-muted-foreground">Status: {form()?.status ?? '—'}</p>
            <p class="mt-2 text-sm text-muted-foreground">Form details and builder will go here.</p>
          </Show>
        </div>
      </section>
    </AppShell>
  )
}
