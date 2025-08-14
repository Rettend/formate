import { A, createAsync, revalidate, useAction } from '@solidjs/router'
import { createSignal, For, onCleanup } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { deleteForm, listForms } from '~/server/forms'

export default function FormsList() {
  const forms = createAsync(() => listForms({}))
  const remove = useAction(deleteForm)
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null)
  const [confirmArmedAtMs, setConfirmArmedAtMs] = createSignal<number>(0)
  let confirmTimer: number | undefined

  const handleDelete = async (id: string) => {
    if (confirmingId() === id) {
      // double-click protection: require a minimal delay between arm and confirm
      if (Date.now() - confirmArmedAtMs() < 100)
        return
      const res = await remove({ formId: id })
      if (res?.ok)
        await revalidate([listForms.key])
      setConfirmingId(null)
      clearTimeout(confirmTimer)
      return
    }
    setConfirmingId(id)
    setConfirmArmedAtMs(Date.now())
    clearTimeout(confirmTimer)
    // auto-cancel confirmation after a short delay
    confirmTimer = setTimeout(() => setConfirmingId(null), 2500) as unknown as number
  }

  onCleanup(() => clearTimeout(confirmTimer))

  return (
    <AppShell requireAuth>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Forms</h1>
            <p class="text-sm text-muted-foreground">Manage your forms</p>
          </div>
          <A href="/forms/new" class="inline-flex">
            <Button variant="gradient" size="sm">New form</Button>
          </A>
        </div>

        <div class="border rounded-lg bg-card text-card-foreground shadow-sm">
          <div class="divide-y">
            {(forms()?.items?.length ?? 0) === 0 && (
              <div class="p-6 text-sm text-muted-foreground">No forms yet. Create your first form.</div>
            )}
            <For each={forms()?.items ?? []}>
              {item => (
                <div class="group flex items-center justify-between p-4 transition-colors hover:bg-accent">
                  {/* Left: title/status clickable */}
                  <A href={`/forms/${item.id}`} class="min-w-0 flex-1">
                    <p class="truncate font-medium">{item.title}</p>
                    <p class="text-xs text-muted-foreground">{item.status}</p>
                  </A>

                  {/* Right: quick actions */}
                  <div class="ml-4 flex translate-x-1 items-center gap-1 opacity-90 transition duration-200 group-hover:translate-x-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    {/* Open */}
                    <A href={`/forms/${item.id}`} title="Open" class="inline-flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-foreground/70 transition-colors duration-150 hover:bg-transparent hover:text-foreground"
                        aria-label="Open"
                      >
                        <span class="i-ph:caret-right-bold size-4" />
                      </Button>
                    </A>
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="pointer-events-none text-destructive/90 opacity-0 transition-colors duration-150 group-focus-within:pointer-events-auto group-hover:pointer-events-auto hover:bg-transparent focus:text-destructive hover:text-destructive group-focus-within:opacity-100 group-hover:opacity-100"
                      title={confirmingId() === item.id ? 'Click to confirm delete' : 'Delete'}
                      aria-label={confirmingId() === item.id ? 'Confirm delete' : 'Delete'}
                      onClick={() => handleDelete(item.id)}
                    >
                      <span class={confirmingId() === item.id ? 'i-ph:check-bold size-4' : 'i-ph:trash-bold size-4'} />
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
