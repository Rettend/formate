# Optimistic Updates in SolidStart (practical, minimal)

This guide shows a simple, robust way to do optimistic UI with SolidStart and `@solidjs/router`, without flicker and without effects.

What you’ll get:

- A tiny “sticky override” pattern for instant UI feedback
- Zero reliance on spinners or effects (no `createEffect`), works great on slow networks
- Clean reconciliation using `revalidate`

If you copy/paste, replace types and keys with your app’s.

## TL;DR

- Server: implement a mutation with `action` and a query with `createAsync`.
- Client: on click, set a local override to the next state, call the action, then `revalidate` your query and clear the override.
- UI: read state from the override when present, otherwise from the query.

This avoids the common flicker where pending submissions race revalidation.

## Core APIs refresher

- `action(fn, key?)`: server mutation. Optionally return `json(..., { revalidate: [...] })` or revalidate on the client after the action.
- `useAction(action)`: invoke a server action.
- `createAsync(() => query())`: data fetching with revalidation hooks.
- `revalidate([query.key])`: refetch one or more queries.

Docs: <https://docs.solidjs.com/solid-router/reference/data-apis/create-async>

## Pattern A — Preferred: sticky override (List rows)

Use a per-id override to reflect the next state immediately; clear it after reconciliation.

```tsx
import { createAsync, revalidate, useAction } from '@solidjs/router'
import { createSignal, For } from 'solid-js'
import { Button } from '~/components/ui/button'
import { listItems, publishItem, unpublishItem } from '~/server/items'

export default function ItemsList() {
  const items = createAsync(() => listItems({}))
  const doPublish = useAction(publishItem)
  const doUnpublish = useAction(unpublishItem)

  // Optimistic override per id
  const [optimistic, setOptimistic] = createSignal<Record<string, 'draft' | 'published'>>({})
  const getState = (id: string, base: 'draft' | 'published') => optimistic()[id] ?? base

  const setDraft = (id: string) => setOptimistic(prev => ({ ...prev, [id]: 'draft' }))
  const setPublished = (id: string) => setOptimistic(prev => ({ ...prev, [id]: 'published' }))
  const clear = (id: string) => setOptimistic(({ [id]: _drop, ...rest }) => rest)

  const handleToggle = async (id: string) => {
    const next = getState(id, 'draft') === 'published' ? 'draft' : 'published'
    next === 'published' ? setPublished(id) : setDraft(id)
    if (next === 'published')
      await doPublish({ itemId: id })
    else await doUnpublish({ itemId: id })
    await revalidate([listItems.key])
    clear(id)
  }

  return (
    <div class="divide-y">
      <For each={items()?.items ?? []}>
        {item => (
          <div class="flex items-center justify-between p-3" id={item.id}>
            <div>
              <div class="truncate font-medium">{item.title}</div>
              <div class="text-xs text-muted-foreground">{getState(item.id, item.status)}</div>
            </div>
            <div class="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => handleToggle(item.id)}>
                <span class={getState(item.id, item.status) === 'published' ? 'i-ph:cloud-slash-bold' : 'i-ph:cloud-arrow-up-bold'} />
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

- The override guarantees the UI doesn’t flicker even if revalidation is slow.
- No effects and no submission plumbing; fewer moving parts.
- After revalidation, the server truth replaces the optimistic value and the override is cleared.

## Pattern B — Preferred: sticky override (Detail view)

Same idea for a single entity.

```tsx
import { createAsync, revalidate, useAction, useParams } from '@solidjs/router'
import { createSignal } from 'solid-js'
import { Button } from '~/components/ui/button'
import { getItem, publishItem, unpublishItem } from '~/server/items'

export default function ItemDetail() {
  const params = useParams()
  const id = () => params.id
  const item = createAsync(() => getItem({ itemId: id() }))

  const doPublish = useAction(publishItem)
  const doUnpublish = useAction(unpublishItem)

  const [override, setOverride] = createSignal<'draft' | 'published' | null>(null)
  const getState = () => override() ?? (item()?.status ?? 'draft')

  const handleToggle = async () => {
    const next = getState() === 'published' ? 'draft' : 'published'
    setOverride(next)
    if (next === 'published')
      await doPublish({ itemId: id() })
    else await doUnpublish({ itemId: id() })
    await revalidate([getItem.key])
    setOverride(null)
  }

  return (
    <div class="flex items-center gap-2">
      <Button variant="outline" onClick={handleToggle}>
        <span class={getState() === 'published' ? 'i-ph:cloud-slash-bold' : 'i-ph:cloud-arrow-up-bold'} />
        <span>{getState() === 'published' ? 'Unpublish' : 'Publish'}</span>
      </Button>
      <span class="text-xs text-muted-foreground">Status: {getState()}</span>
    </div>
  )
}
```

## Optional — Using pending submissions

`useSubmission` / `useSubmissions` are handy when you need to reflect multiple concurrent operations or echo request input (e.g., text fields). However, relying solely on pending state can cause brief flicker when revalidation responses race with your optimistic render on slow networks.

Tips if you choose this route:

- Prefer a tiny override in addition to pending-derived state for toggles; the override wins while the request is in flight.
- Avoid effects; stick to `createSignal`/`createMemo` and read pending state directly where you render.
- Still revalidate on completion (or use server-driven `json(..., { revalidate })`).

## Server-side revalidation

Two common ways to reconcile:

1. Client-driven

```ts
await doPublish({ itemId })
await revalidate([getItem.key, listItems.key])
```

2. Server-driven

```ts
import { action, json } from '@solidjs/router'

export const publishItem = action(async (input: { itemId: string }) => {
  'use server'
  // mutate
  return json({ ok: true }, { revalidate: [getItem.key, listItems.key] })
}, 'item:publish')
```

Pick one and keep it consistent.

## Common pitfalls

- Flicker when using only pending state for optimism: prefer the sticky override.
- Rendering logic that depends on effects: not needed; derive from signals/memos inline.
- Forgetting to clear the override after revalidation: the UI will stay optimistic.

## Checklist

- [ ] Server `action` for the mutation
- [ ] Query via `createAsync`
- [ ] Local override (per id or per entity)
- [ ] Call action → `revalidate([...])` → clear override

---

For complex cases (edits, inserts, batch operations), you can still combine submission-derived state with small overrides. Start simple; add complexity only when it clearly pays off.
