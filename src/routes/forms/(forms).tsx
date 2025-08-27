import { Protected } from '@rttnd/gau/client/solid'
import { A, createAsync, revalidate, useAction, useSubmissions } from '@solidjs/router'
import { createSignal, For, onCleanup } from 'solid-js'
import { AppShell } from '~/components/AppShell'
import { Button } from '~/components/ui/button'
import { deleteForm, duplicateForm, listForms, publishForm, unpublishForm } from '~/server/forms'

export default Protected(() => <FormsList />, '/')

function FormsList() {
  const forms = createAsync(() => listForms({}))
  const remove = useAction(deleteForm)
  const duplicate = useAction(duplicateForm)
  const publish = useAction(publishForm)
  const unpublish = useAction(unpublishForm)
  const publishSubs = useSubmissions(publishForm)
  const unpublishSubs = useSubmissions(unpublishForm)
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

  const handlePublishToggle = async (id: string, status: string) => {
    if (status === 'published')
      await unpublish({ formId: id })
    else
      await publish({ formId: id })
    await revalidate([listForms.key])
  }

  const handleDuplicate = async (id: string) => {
    await duplicate({ formId: id })
  }

  const handleShare = async (id: string, slug?: string | null) => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${base}/r/${slug || id}`
    try {
      await navigator.clipboard.writeText(url)
    }
    catch {
      // noop
    }
  }

  const getInputFormId = (input: unknown): string | undefined => {
    const arg: any = Array.isArray(input) ? input[0] : input
    if (!arg)
      return undefined
    if (typeof arg === 'string')
      return arg
    return arg.formId
  }

  const isPublishing = (id: string) => {
    for (const sub of publishSubs.values()) {
      if (!sub.pending)
        continue
      if (getInputFormId(sub.input) === id)
        return true
    }
    return false
  }

  const isUnpublishing = (id: string) => {
    for (const sub of unpublishSubs.values()) {
      if (!sub.pending)
        continue
      if (getInputFormId(sub.input) === id)
        return true
    }
    return false
  }

  const optimisticStatus = (id: string, base: string) => {
    if (isPublishing(id))
      return 'published'
    if (isUnpublishing(id))
      return 'draft'
    return base
  }

  return (
    <AppShell>
      <section>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Forms</h1>
            <p class="text-sm text-muted-foreground">Manage your forms</p>
          </div>
          <A href="/forms/new" class="inline-flex">
            <Button variant="default" size="sm">New form</Button>
          </A>
        </div>

        <div class="border rounded-lg bg-card text-card-foreground shadow-sm">
          <div class="divide-y">
            {(forms()?.items?.length ?? 0) === 0 && (
              <div class="p-6 text-sm text-muted-foreground">No forms yet. Create your first form.</div>
            )}
            <For each={forms()?.items ?? []}>
              {item => (
                <div class="group flex items-center justify-between px-4 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent">
                  {/* Left: title/status clickable */}
                  <A href={`/forms/${item.id}`} class="min-w-0 flex-1 py-4">
                    <p class="truncate font-medium">{item.title}</p>
                    <span class="flex items-center gap-2">
                      <p class="text-xs text-muted-foreground">{optimisticStatus(item.id, item.status)}</p>
                      <span class="text-xs opacity-60">•</span>
                      <p class="break-all text-xs text-muted-foreground">{item.slug ? `/${item.slug}` : `${item.id}`}</p>
                    </span>
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
                    {/* View (respondent) */}
                    <A href={`/r/${item.slug || item.id}`} title="View" class="inline-flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-foreground/70 transition-colors duration-150 hover:bg-transparent hover:text-foreground"
                        aria-label="View"
                      >
                        <span class="i-ph:eye-bold size-4" />
                      </Button>
                    </A>
                    {/* Duplicate */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-foreground/70 transition-colors duration-150 hover:bg-transparent hover:text-foreground"
                      title="Duplicate"
                      aria-label="Duplicate"
                      onClick={() => handleDuplicate(item.id)}
                    >
                      <span class="i-ph:copy-bold size-4" />
                    </Button>
                    {/* Publish/Unpublish */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-foreground/70 transition-colors duration-150 hover:bg-transparent hover:text-foreground"
                      title={optimisticStatus(item.id, item.status) === 'published' ? 'Unpublish' : 'Publish'}
                      aria-label={optimisticStatus(item.id, item.status) === 'published' ? 'Unpublish' : 'Publish'}
                      disabled={isPublishing(item.id) || isUnpublishing(item.id)}
                      onClick={() => handlePublishToggle(item.id, optimisticStatus(item.id, item.status))}
                    >
                      <span class={isPublishing(item.id) || isUnpublishing(item.id) ? 'i-svg-spinners:180-ring size-4' : (optimisticStatus(item.id, item.status) === 'published' ? 'i-ph:cloud-slash-bold size-4' : 'i-ph:cloud-arrow-up-bold size-4')} />
                    </Button>
                    {/* Share */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-foreground/70 transition-colors duration-150 hover:bg-transparent hover:text-foreground"
                      title="Copy share link"
                      aria-label="Copy share link"
                      onClick={() => handleShare(item.id, item.slug)}
                    >
                      <span class="i-ph:link-bold size-4" />
                    </Button>
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="pointer-events-none text-destructive/90 opacity-0 transition-all duration-150 group-focus-within:pointer-events-auto group-hover:pointer-events-auto hover:bg-transparent focus:text-destructive hover:text-destructive group-focus-within:opacity-100 group-hover:opacity-100"
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
