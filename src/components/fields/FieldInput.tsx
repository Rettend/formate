import type { FormField } from '~/lib/validation/form-plan'
import { debounce } from '@solid-primitives/scheduled'
import { createEffect, createMemo, createSignal, For, Show, untrack } from 'solid-js'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '~/components/ui/radio-group'
import { Switch, SwitchControl, SwitchThumb } from '~/components/ui/switch'
import { useRespondentLocalStore } from '~/stores/respondent'

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

function placeholderFor(field: FormField) {
  switch (field.type) {
    case 'short_text':
      return 'Brief answer'
    case 'long_text':
      return 'Describe in detail'
    case 'number':
      return 'Enter a number'
    default:
      return field.label ?? ''
  }
}

export function FieldInput(props: { field: FormField, id: string, initialAnswer?: unknown, conversationId?: string }) {
  const [local, setLocal] = useRespondentLocalStore()
  const convId = () => props.conversationId
  const turnIdFromDom = () => props.id.replace(/^answer-/, '')
  const draftKey = () => `${turnIdFromDom()}:${props.field.id}`
  const readDraft = (): unknown => {
    const cid = convId()
    if (!cid)
      return undefined
    return local.draftsByConversation?.[cid]?.[draftKey()]
  }
  const writeDraftImmediate = (val: unknown) => {
    const cid = convId()
    if (!cid)
      return
    setLocal('draftsByConversation', prev => prev ?? ({}))
    setLocal('draftsByConversation', cid, prev => prev ?? ({}))
    setLocal('draftsByConversation', cid, draftKey(), val as any)
  }
  const writeDraftDebounced = debounce((val: unknown) => {
    untrack(() => writeDraftImmediate(val))
  }, 1000)
  let hiddenEl: HTMLInputElement | undefined
  const placeholder = createMemo(() => placeholderFor(props.field))
  const initial = createMemo(() => props.initialAnswer)
  const initialText = createMemo(() => {
    const v = readDraft() ?? initial()
    if (typeof v === 'string')
      return v
    if (typeof v === 'number' || typeof v === 'boolean')
      return String(v)
    return ''
  })

  return (
    <>
      {/* Short text */}
      <Show when={props.field.type === 'short_text'}>
        <input
          id={props.id}
          type="text"
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={placeholder()}
          value={initialText()}
          onInput={e => writeDraftDebounced((e.currentTarget as HTMLInputElement).value)}
          onBlur={e => writeDraftImmediate((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Long text */}
      <Show when={props.field.type === 'long_text'}>
        <textarea
          id={props.id}
          rows={5}
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={placeholder()}
          value={initialText()}
          onInput={e => writeDraftDebounced((e.currentTarget as HTMLTextAreaElement).value)}
          onBlur={e => writeDraftImmediate((e.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Number */}
      <Show when={props.field.type === 'number'}>
        <input
          id={props.id}
          type="number"
          class="w-full border rounded-md bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          placeholder={placeholder()}
          min={props.field.validation?.min as any}
          max={props.field.validation?.max as any}
          inputmode="decimal"
          value={initialText()}
          onInput={e => writeDraftDebounced((e.currentTarget as HTMLInputElement).value)}
          onBlur={e => writeDraftImmediate((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={e => onKeyDownSubmit(e)}
        />
      </Show>

      {/* Multiple choice (single select) */}
      <Show when={props.field.type === 'multiple_choice'}>
        {(() => {
          const opts = Array.isArray(props.field.options) ? props.field.options : []
          const findIdFor = (v: unknown): string | undefined => {
            if (typeof v === 'string') {
              if (opts.some(o => o.id === v))
                return v
              const byLabel = opts.find(o => o.label === v)
              return byLabel?.id
            }
            if (typeof v === 'number' || typeof v === 'boolean') {
              const s = String(v)
              if (opts.some(o => o.id === s))
                return s
              const byLabel = opts.find(o => o.label === s)
              return byLabel?.id
            }
            return undefined
          }
          const [val, setVal] = createSignal<string>(findIdFor(readDraft() ?? initial()) ?? '')
          createEffect(() => {
            if (hiddenEl) {
              const selected = opts.find(o => o.id === val())
              hiddenEl.value = (selected?.label ?? val() ?? '') as string
            }
          })
          createEffect(() => {
            writeDraftImmediate(val())
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
          const init = (() => {
            const v = initial()
            if (typeof v === 'boolean')
              return v
            if (typeof v === 'string')
              return v.toLowerCase() === 'true'
            if (typeof v === 'number')
              return v !== 0
            return false
          })()
          const [on, setOn] = createSignal((() => {
            const d = readDraft()
            if (typeof d === 'string')
              return d.toLowerCase() === 'true'
            if (typeof d === 'boolean')
              return d
            return init
          })())
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = on() ? 'true' : 'false'
          })
          createEffect(() => {
            writeDraftImmediate(on())
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
          const parseInitial = (v: unknown): string[] => {
            if (Array.isArray(v)) {
              return v
                .map(x => (typeof x === 'string' ? x : String(x)))
                .map((x) => {
                  if (opts.some(o => o.id === x))
                    return x
                  const byLabel = opts.find(o => o.label === x)
                  return byLabel?.id
                })
                .filter((x): x is string => Boolean(x))
            }
            if (typeof v === 'string') {
              const s = v.trim()
              if (s.startsWith('[') && s.endsWith(']')) {
                try {
                  const arr = JSON.parse(s)
                  if (Array.isArray(arr))
                    return parseInitial(arr)
                }
                catch {}
              }
              // fall through
              if (opts.some(o => o.id === s))
                return [s]
              const byLabel = opts.find(o => o.label === s)
              if (byLabel?.id)
                return [byLabel.id]
            }
            return []
          }
          const [vals, setVals] = createSignal<string[]>(parseInitial(readDraft() ?? initial()))
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = JSON.stringify(vals())
          })
          createEffect(() => {
            writeDraftImmediate(vals())
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
          const init = (() => {
            const v = initial()
            if (typeof v === 'number')
              return String(v)
            if (typeof v === 'string')
              return v
            return ''
          })()
          const [val, setVal] = createSignal<string>((() => {
            const d = readDraft()
            if (typeof d === 'string')
              return d
            if (typeof d === 'number')
              return String(d)
            return init
          })())
          createEffect(() => {
            if (hiddenEl)
              hiddenEl.value = val() ?? ''
          })
          createEffect(() => {
            writeDraftImmediate(val())
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
