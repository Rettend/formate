import { Protected } from '@rttnd/gau/client/solid'
import { useAction, useNavigate } from '@solidjs/router'
import { createSignal } from 'solid-js'
import { toast } from 'solid-sonner'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { createForm } from '~/server/forms'

export default Protected(() => <NewForm />, '/')

function NewForm() {
  const navigate = useNavigate()
  const create = useAction(createForm)
  const [title, setTitle] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)

  const handleCreate = async () => {
    const t = title().trim()
    if (t.length === 0) {
      toast.error('Title is required')
      return
    }
    try {
      setSubmitting(true)
      const created = await create({ title: t })
      if (created?.id)
        navigate(`/forms/${created.id}`)
      else
        navigate('/forms')
    }
    catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create form'
      toast.error(message)
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <section>
        <h1 class="mb-4 text-xl font-semibold tracking-tight">Create form</h1>
        <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm space-y-4">
          <div class="space-y-2">
            <label for="title" class="text-sm font-medium">Title</label>
            <input
              id="title"
              type="text"
              value={title()}
              onInput={e => setTitle(e.currentTarget.value)}
              placeholder="Untitled form"
              class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none ring-0 focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <p class="text-xs text-muted-foreground">A short, descriptive name for your form.</p>
          </div>

          <div class="flex gap-2">
            <Button variant="default" size="sm" disabled={submitting()} onClick={handleCreate}>
              <span class={submitting() ? 'i-svg-spinners:180-ring' : 'i-ph:plus-bold'} />
              <span>{submitting() ? 'Creating…' : 'Create'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/forms')}>Cancel</Button>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
