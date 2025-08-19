import type { FormField } from '~/lib/validation/form-plan'
import { createEffect, createSignal, For, Show } from 'solid-js'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '~/components/ui/radio-group'
import { Switch, SwitchControl, SwitchThumb } from '~/components/ui/switch'

function submitActiveTurn() {
  try {
    document.dispatchEvent(new CustomEvent('submit-active-turn'))
  }
  catch {}
}
function onKeyDownSubmit(e: KeyboardEvent) {
  if (e.key !== 'Enter')
    return
  const target = e.target as HTMLElement | null
  const tag = (target?.tagName || '').toLowerCase()
  // Textarea: only submit on Ctrl+Enter (or Cmd+Enter on mac); Enter and Shift+Enter insert newline
  if (tag === 'textarea') {
    if (e.ctrlKey || (e as any).metaKey) {
      e.preventDefault()
      submitActiveTurn()
    }
    return
  }
  // Other single-line inputs: Enter (without Shift) submits
  if (!e.shiftKey) {
    e.preventDefault()
    submitActiveTurn()
  }
}

export function FieldInput(props: { field: FormField, id: string }) {
  // Helper to keep a hidden input in sync for non-native controls so caller can read by id
  let hiddenEl: HTMLInputElement | undefined

  return (
    <>
      {/* Short text */}
      <Show when={props.field.type === 'short_text'}>
        <input
          id={props.id}
          type="text"
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={props.field.label}
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Long text */}
      <Show when={props.field.type === 'long_text'}>
        <textarea
          id={props.id}
          rows={5}
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={props.field.label}
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Number */}
      <Show when={props.field.type === 'number'}>
        <input
          id={props.id}
          type="number"
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={props.field.label}
          min={props.field.validation?.min as any}
          max={props.field.validation?.max as any}
          inputmode="decimal"
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Multiple choice (single select) */}
      <Show when={props.field.type === 'multiple_choice'}>
        {(() => {
          const opts = Array.isArray(props.field.options) ? props.field.options : []
          const [val, setVal] = createSignal<string>('')
          createEffect(() => {
            if (hiddenEl) {
              const selected = opts.find(o => o.id === val())
              hiddenEl.value = (selected?.label ?? val() ?? '') as string
            }
          })
          return (
            <div class="space-y-2" onKeyDown={e => onKeyDownSubmit(e)}>
              <RadioGroup value={val()} onChange={setVal} name={`${props.id}-rg`} class="gap-2">
                <For each={opts}>
                  {o => (
                    <RadioGroupItem value={o.id}>
                      <RadioGroupItemLabel>{o.label}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
              {/* Hidden input to expose current selection to parent by id */}
              <input ref={hiddenEl} id={props.id} type="hidden" />
            </div>
          )
        })()}
      </Show>

      {/* Boolean (yes/no) */}
      <Show when={props.field.type === 'boolean'}>
        {(() => {
          const [on, setOn] = createSignal(false)
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = on() ? 'true' : 'false'
          })
          return (
            <div class="flex items-center gap-2" onKeyDown={e => onKeyDownSubmit(e)}>
              <Switch checked={on()} onChange={setOn}>
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </Switch>
              <span class="text-sm text-muted-foreground">{on() ? 'Yes' : 'No'}</span>
              <input ref={hiddenEl} id={props.id} type="hidden" />
            </div>
          )
        })()}
      </Show>

      {/* Multiple choice (multi select via checkboxes) */}
      <Show when={props.field.type === 'multi_select'}>
        {(() => {
          const opts = Array.isArray(props.field.options) ? props.field.options : []
          const [vals, setVals] = createSignal<string[]>([])
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = JSON.stringify(vals())
          })
          const toggle = (id: string) => {
            setVals(prev => (prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]))
          }
          return (
            <div class="space-y-2" onKeyDown={e => onKeyDownSubmit(e)}>
              <For each={opts}>
                {(o) => {
                  const cid = `${props.id}-${o.id}`
                  return (
                    <div class="flex items-center gap-2 text-sm">
                      <Checkbox id={cid} checked={vals().includes(o.id)} onChange={() => toggle(o.id)} />
                      <Label for={`${cid}-input`}>{o.label}</Label>
                    </div>
                  )
                }}
              </For>
              <input ref={hiddenEl} id={props.id} type="hidden" />
            </div>
          )
        })()}
      </Show>

      {/* Rating (1..5) */}
      <Show when={props.field.type === 'rating'}>
        {(() => {
          const max = Math.max(1, Math.min(10, Number(props.field.validation?.max ?? 5)))
          const [val, setVal] = createSignal<string>('')
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = val() ?? ''
          })
          const items = Array.from({ length: max }, (_, i) => String(i + 1))
          return (
            <div class="space-y-2" onKeyDown={e => onKeyDownSubmit(e)}>
              <RadioGroup value={val()} onChange={setVal} name={`${props.id}-rating`} class="flex gap-3">
                <For each={items}>
                  {v => (
                    <RadioGroupItem value={v}>
                      <RadioGroupItemLabel>{v}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
              <input ref={hiddenEl} id={props.id} type="hidden" />
            </div>
          )
        })()}
      </Show>
    </>
  )
}

export default FieldInput
