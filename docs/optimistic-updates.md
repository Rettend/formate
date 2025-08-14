# Optimistic Updates in SolidStart

This guide shows practical patterns for implementing optimistic UI with SolidStart and `@solidjs/router`. It covers:

- When and why to use optimistic updates
- The core APIs: `action`, `useAction`, `useSubmission`, `useSubmissions`, `revalidate`
- Deriving optimistic state from pending submissions (no extra client store needed)
- Patterns for list rows and detail views (toggle/publish, edit fields)
- Error handling and reconciliation

If you copy/paste, replace types and keys with your app’s.

## TL;DR

- Server: define `action` handlers that perform the mutation, and revalidate any queries if needed.
- Client: call the action via `useAction`, then use `useSubmission` or `useSubmissions` to detect pending requests and compute an optimistic state.
- UI: render the optimistic state; disable controls and show a spinner while pending; after the server responds, background revalidate (or rely on the action’s revalidate) to reconcile.

## Core APIs refresher

- `action(fn, key?)`: server mutation. You can return values and optionally signal revalidation when using SolidStart’s `json()` helper, or manually call `revalidate([query.key])` on the client after `useAction` returns.
- `useAction(action)`: returns a function to invoke the server action.
- `useSubmission(action)`: returns the latest submission state for a given action (single), including `.pending` and `.input`.
- `useSubmissions(action)`: returns an iterable collection of all current/past submissions for that action (handy for lists where multiple items may be pending at once).
- `createAsync(() => query())`: data fetching; used with query keys for revalidation.
- `revalidate([query.key])`: client-side prompt to refetch a query.

Docs: <https://docs.solidjs.com/solid-router/reference/data-apis/use-submission>

## Pattern A — Toggle with optimistic state (List rows)

Use when you have a list of items with a per-item toggle (e.g., publish/unpublish). The idea is to derive an optimistic status from pending submissions.

```tsx
import { createAsync, revalidate, useAction, useSubmissions } from '@solidjs/router'
import { For } from 'solid-js'
import { Button } from '~/components/ui/button'
import { listItems, publishItem, unpublishItem } from '~/server/items'

export default function ItemsList() {
  const items = createAsync(() => listItems({}))
  const doPublish = useAction(publishItem)
  const doUnpublish = useAction(unpublishItem)

  const publishSubs = useSubmissions(publishItem)
  const unpublishSubs = useSubmissions(unpublishItem)

  // Helper to read id from submission input (array or object)
  const getInputId = (input: unknown): string | undefined => {
    const arg: any = Array.isArray(input) ? input[0] : input
    if (!arg)
      return undefined
    return typeof arg === 'string' ? arg : arg.itemId
  }

  const isPublishing = (id: string) =>
    publishSubs.values().some(s => s.pending && getInputId(s.input) === id)

  const isUnpublishing = (id: string) =>
    unpublishSubs.values().some(s => s.pending && getInputId(s.input) === id)

  const optimisticStatus = (id: string, base: 'draft' | 'published') => {
    if (isPublishing(id))
      return 'published'
    if (isUnpublishing(id))
      return 'draft'
    return base
  }

  const handleToggle = async (id: string, status: 'draft' | 'published') => {
    if (status === 'published')
      await doUnpublish({ itemId: id })
    else await doPublish({ itemId: id })
    await revalidate([listItems.key])
  }

  return (
    <div class="divide-y">
      <For each={items()?.items}>
        {item => (
          <div class="flex items-center justify-between p-3" id={item.id}>
            <div>
              <div class="truncate font-medium">{item.title}</div>
              <div class="text-xs text-muted-foreground">
                {optimisticStatus(item.id, item.status)}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={isPublishing(item.id) || isUnpublishing(item.id)}
                onClick={() => handleToggle(item.id, optimisticStatus(item.id, item.status))}
                title={optimisticStatus(item.id, item.status) === 'published' ? 'Unpublish' : 'Publish'}
              >
                <span class={
                  isPublishing(item.id) || isUnpublishing(item.id)
                    ? 'i-svg-spinners:180-ring animate-spin'
                    : optimisticStatus(item.id, item.status) === 'published'
                      ? 'i-ph:cloud-slash-bold'
                      : 'i-ph:cloud-arrow-up-bold'
                }
                />
              </Button>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
```

Why this works:

- No additional client store is needed; the pending submission is the source of truth.
- The UI reflects the new state immediately; the spinner communicates “in-flight”.
- On completion, `revalidate` fetches the canonical server state.

## Pattern B — Toggle with optimistic state (Detail view)

Same idea, simplified to one entity. `useSubmissions` still works well, but `useSubmission` is fine for a single in-flight operation per action.

```tsx
import { createAsync, revalidate, useAction, useParams, useSubmissions } from '@solidjs/router'
import { Button } from '~/components/ui/button'
import { getItem, publishItem, unpublishItem } from '~/server/items'

export default function ItemDetail() {
  const params = useParams()
  const id = () => params.id
  const item = createAsync(() => getItem({ itemId: id() }))

  const doPublish = useAction(publishItem)
  const doUnpublish = useAction(unpublishItem)

  const publishSubs = useSubmissions(publishItem)
  const unpublishSubs = useSubmissions(unpublishItem)

  const getInputId = (input: unknown): string | undefined => {
    const arg: any = Array.isArray(input) ? input[0] : input
    if (!arg)
      return undefined
    return typeof arg === 'string' ? arg : arg.itemId
  }

  const isPublishing = () => publishSubs.values().some(s => s.pending && getInputId(s.input) === id())
  const isUnpublishing = () => unpublishSubs.values().some(s => s.pending && getInputId(s.input) === id())

  const optimisticStatus = () => {
    if (isPublishing())
      return 'published'
    if (isUnpublishing())
      return 'draft'
    return item()?.status
  }

  const handleToggle = async () => {
    const next = optimisticStatus() === 'published' ? 'unpublish' : 'publish'
    if (next === 'unpublish')
      await doUnpublish({ itemId: id() })
    else await doPublish({ itemId: id() })
    await revalidate([getItem.key])
  }

  return (
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={isPublishing() || isUnpublishing()}
        onClick={handleToggle}
      >
        <span class={(isPublishing() || isUnpublishing()) ? 'i-svg-spinners:180-ring animate-spin' : (optimisticStatus() === 'published' ? 'i-ph:cloud-slash-bold' : 'i-ph:cloud-arrow-up-bold')} />
        <span>{optimisticStatus() === 'published' ? 'Unpublish' : 'Publish'}</span>
      </Button>
      <span class="text-xs text-muted-foreground">Status: {optimisticStatus()}</span>
    </div>
  )
}
```

## Pattern C — Text input with optimistic echo

When editing text, you can use `useSubmission(action)` to echo the current field value while the server round-trip completes.

```tsx
import { action, useAction, useSubmission } from '@solidjs/router'

export const updateTitle = action(async (input: { id: string, title: string }) => {
  'use server'
  // ... update DB
  return { ok: true }
}, 'item:updateTitle')

export function EditableTitle(props: { id: string, title: string }) {
  const submit = useAction(updateTitle)
  const submission = useSubmission(updateTitle)

  const displayTitle = () => {
    const pending = submission.pending && submission.input?.title
    return (pending as string) ?? props.title
  }

  return (
    <input
      value={displayTitle()}
      onBlur={e => submit({ id: props.id, title: e.currentTarget.value })}
    />
  )
}
```

## Server-side: revalidation options

Two common ways to reconcile after a mutation:

1. Trigger revalidation on the client after the action resolves:

```ts
const res = await doPublish({ itemId })
await revalidate([getItem.key, listItems.key])
```

2. Return a response that instructs the router to revalidate specific queries (SolidStart’s `json()` helper):

```ts
import { action, json } from '@solidjs/router'

export const publishItem = action(async (input: { itemId: string }) => {
  'use server'
  // mutate
  return json({ ok: true }, { revalidate: [getItem.key, listItems.key] })
}, 'item:publish')
```

Pick one approach and keep it consistent in your codebase.

## Error handling and rollbacks

- UI: always disable controls and show a spinner for pending submissions.
- If the server rejects, the pending submission disappears and your view falls back to the base state; the next revalidation ensures correctness.
- Optionally show a toast on error (wrap `await doAction().catch()` or inspect action result).
- For complex list/state changes (inserts, moves), you can maintain a lightweight store and apply mutations from `useSubmissions()` like an event log. Example flow:
  - Read all pending submissions
  - Project them into local state (create/move/delete)
  - On success, re-fetch server truth and reconcile

## Practical tips

- Guard your optimistic state derivation with small helpers to decode the action’s `.input` shape.
- Keep optimistic logic colocated with the UI that benefits from it.
- Show intent with icons and disable + spinner while pending.
- Prefer `useSubmissions` for lists (multiple concurrent) and `useSubmission` for single-form edits.
- For testing, you can expose a small flag to disable optimistic updates (e.g., `window.toggleOptimistic?.()`), then observe the difference.

## Checklist for a new optimistic toggle

- [ ] Server `action` for on/off (e.g., publish/unpublish)
- [ ] Client invokes via `useAction`
- [ ] Derive optimistic state from `useSubmissions`
- [ ] Render optimistic value and spinner; disable while pending
- [ ] Revalidate on completion (or server-driven revalidate)

## See also

- Solid Router useSubmission docs: <https://docs.solidjs.com/solid-router/reference/data-apis/use-submission>
- Router actions and queries overview: <https://docs.solidjs.com/solid-router>

---

If you want, we can extract a tiny `useOptimisticToggle` helper that accepts an action pair and an id extractor, and returns `{ isOn, isPending, toggle }` to reuse across list and detail UIs.
