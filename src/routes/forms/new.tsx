import { useAction, useNavigate } from '@solidjs/router'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { createForm } from '~/server/forms'

export default function NewForm() {
  const navigate = useNavigate()
  const create = useAction(createForm)
  const handleCreate = async () => {
    const created = await create({ title: 'Untitled Form' })
    if (created?.id)
      navigate(`/forms/${created.id}`)
    else
      navigate('/forms')
  }

  return (
    <AppShell requireAuth>
      <section>
        <h1 class="mb-4 text-xl font-semibold tracking-tight">Create form</h1>
        <div class="border rounded-lg bg-card p-4 text-card-foreground shadow-sm space-y-4">
          <p class="text-sm text-muted-foreground">Form creation flow coming next. Click create to proceed.</p>
          <div class="flex gap-2">
            <Button variant="gradient" size="sm" onClick={handleCreate}>Create</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/forms')}>Cancel</Button>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
