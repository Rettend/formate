import type { ModelConfigObject, Provider } from '~/lib/ai/lists'
import type { FormPlan, TestRunStep } from '~/lib/validation/form-plan'
import type { Form } from '~/server/db/schema'
import { revalidate, useAction } from '@solidjs/router'
import { createMemo, createSignal, For, Show, untrack } from 'solid-js'
import { toast } from 'solid-sonner'
import { ModelRatingDisplay } from '~/components/ModelRatings'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput } from '~/components/ui/number-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { aiErrorToMessage, logAIError } from '~/lib/ai/errors'
import { getModelAlias, models } from '~/lib/ai/lists'
import { createTestRun, getForm, planWithAI, runTestStep, saveFormPrompt } from '~/server/forms'
import { useUIStore } from '~/stores/ui'
import { decryptApiKey } from '~/utils/crypto'

export function LLMBuilder(props: { form: Form, onSavingChange?: (saving: boolean) => void }) {
  const { ui } = useUIStore()
  const doPlan = useAction(planWithAI)
  const doTestRun = useAction(createTestRun)
  const doTestStep = useAction(runTestStep)
  const doSaveConfig = useAction(saveFormPrompt)

  const [llmProvider, setLlmProvider] = createSignal<Provider | null>(untrack(() => props.form.aiConfigJson?.provider as Provider) ?? null)
  const [model, setModel] = createSignal<string | null>(untrack(() => props.form.aiConfigJson?.modelId) ?? null)
  const [prompt, setPrompt] = createSignal<string>(untrack(() => props.form.aiConfigJson?.prompt) ?? '')
  const [temperature, setTemperature] = createSignal<number>(0.5)

  const currentModels = createMemo<ModelConfigObject[]>(() => (llmProvider() ? (models[llmProvider()!]) : []) ?? [])
  const selectedModelObject = createMemo<ModelConfigObject | null>(() => currentModels().find(m => m.value === model()!) || null)

  const [planning, setPlanning] = createSignal(false)
  const [testing, setTesting] = createSignal(false)
  const [lastPlan, setLastPlan] = createSignal<FormPlan | null>(null)
  const [lastRunId, setLastRunId] = createSignal<string | null>(null)
  const [_saving, setSaving] = createSignal(false)

  const plan = createMemo<FormPlan | null>(() => props.form.settingsJson ?? null)
  const providerOptions = createMemo(() => Object.keys(models))

  // Live runner state
  const [liveRunning, setLiveRunning] = createSignal(false)
  const [livePaused, setLivePaused] = createSignal(false)
  const [liveIndex, setLiveIndex] = createSignal(0)
  const [liveTotal, setLiveTotal] = createSignal<number | null>(null)
  const [liveTranscript, setLiveTranscript] = createSignal<TestRunStep[]>([])

  const serverProvider = createMemo<Provider | null>(() => (props.form.aiConfigJson?.provider as Provider) ?? null)
  const serverModel = createMemo<string | null>(() => props.form.aiConfigJson?.modelId ?? null)
  const serverPrompt = createMemo<string>(() => props.form.aiConfigJson?.prompt ?? '')
  const canPlan = createMemo(() => !!llmProvider() && !!model() && prompt().trim().length > 0)
  const canTest = canPlan
  const hasChanges = createMemo(() => (
    (llmProvider() ?? null) !== (serverProvider() ?? null)
    || (model() ?? null) !== (serverModel() ?? null)
    || (prompt().trim() ?? '') !== (serverPrompt() ?? '')
  ))

  const saveIfChanged = async () => {
    const provider = llmProvider()
    const modelId = model()
    const pr = prompt().trim()
    if (!provider || !modelId || pr.length === 0)
      return
    if (!hasChanges())
      return
    try {
      setSaving(true)
      props.onSavingChange?.(true)
      const res = await doSaveConfig({ formId: props.form.id, prompt: pr, provider, modelId })
      if (res?.ok)
        await revalidate([getForm.key])
    }
    catch (err) {
      logAIError(err, 'save-config')
      const msg = aiErrorToMessage(err)
      toast.error(msg)
    }
    finally {
      setSaving(false)
      props.onSavingChange?.(false)
    }
  }

  const handlePlan = async () => {
    if (!canPlan())
      return
    try {
      setPlanning(true)
      let apiKey: string | undefined
      const provider = llmProvider()!
      const enc = ui.apiKeys?.[provider]
      if (enc) {
        try {
          apiKey = await decryptApiKey(enc)
        }
        catch {
          apiKey = undefined
        }
      }
      const res = await doPlan({ formId: props.form.id, prompt: prompt().trim(), provider, modelId: model()!, temperature: temperature(), apiKey })
      if (res?.plan) {
        setLastPlan(res.plan as FormPlan)
        await revalidate([getForm.key])
      }
    }
    catch (err) {
      logAIError(err, 'plan')
      const msg = aiErrorToMessage(err)
      toast.error(msg)
    }
    finally {
      setPlanning(false)
    }
  }

  const handleTestRun = async () => {
    if (!canTest())
      return
    try {
      setTesting(true)
      let apiKey: string | undefined
      const provider = llmProvider()!
      const enc = ui.apiKeys?.[provider]
      if (enc) {
        try {
          apiKey = await decryptApiKey(enc)
        }
        catch {
          apiKey = undefined
        }
      }
      const res = await doTestRun({ formId: props.form.id, provider, modelId: model()!, maxSteps: 5, apiKey })
      setLastRunId(res?.run?.id ?? null)
    }
    catch (err) {
      logAIError(err, 'test-run')
      const msg = aiErrorToMessage(err)
      toast.error(msg)
    }
    finally {
      setTesting(false)
    }
  }

  const startLive = async () => {
    setLiveTranscript([])
    setLiveIndex(0)
    setLiveTotal(null)
    setLivePaused(false)
    setLiveRunning(true)
    while (true) {
      if (!liveRunning() || livePaused())
        break
      const idx = liveIndex()
      try {
        let apiKey: string | undefined
        const provider = llmProvider()!
        const enc = ui.apiKeys?.[provider]
        if (enc) {
          try {
            apiKey = await decryptApiKey(enc)
          }
          catch {
            apiKey = undefined
          }
        }
        const res = await doTestStep({ formId: props.form.id, index: idx, provider, modelId: model()!, apiKey })
        if (res?.step) {
          setLiveTranscript(t => [...t, res.step as TestRunStep])
          setLiveIndex(idx + 1)
          if (typeof res.total === 'number')
            setLiveTotal(res.total)
          if (idx + 1 >= (res.total ?? idx + 1)) {
            setLiveRunning(false)
            break
          }
        }
        else {
          setLiveRunning(false)
          break
        }
      }
      catch (err) {
        logAIError(err, 'live-step')
        const msg = aiErrorToMessage(err)
        toast.error(msg)
        setLiveRunning(false)
        break
      }
    }
  }

  const pauseLive = () => setLivePaused(true)
  const resumeLive = async () => {
    if (!liveRunning())
      setLiveRunning(true)
    setLivePaused(false)
    while (true) {
      if (!liveRunning() || livePaused())
        break
      const idx = liveIndex()
      try {
        let apiKey: string | undefined
        const provider = llmProvider()!
        const enc = ui.apiKeys?.[provider]
        if (enc) {
          try {
            apiKey = await decryptApiKey(enc)
          }
          catch {
            apiKey = undefined
          }
        }
        const res = await doTestStep({ formId: props.form.id, index: idx, provider, modelId: model()!, apiKey })
        if (res?.step) {
          setLiveTranscript(t => [...t, res.step as TestRunStep])
          setLiveIndex(idx + 1)
          if (typeof res.total === 'number')
            setLiveTotal(res.total)
          if (idx + 1 >= (res.total ?? idx + 1)) {
            setLiveRunning(false)
            break
          }
        }
        else {
          setLiveRunning(false)
          break
        }
      }
      catch (err) {
        logAIError(err, 'live-step')
        const msg = aiErrorToMessage(err)
        toast.error(msg)
        setLiveRunning(false)
        break
      }
    }
  }
  const stopLive = () => {
    setLiveRunning(false)
    setLivePaused(false)
  }

  return (
    <div class="flex flex-col gap-6">
      {/* Controls split into two cards */}
      <div class="grid grid-cols-1 mt-6 gap-4 md:grid-cols-2">
        {/* Provider / Model / Temperature */}
        <div class="border rounded-lg bg-card p-4 shadow-sm">
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
              <Label>Provider</Label>
              <Select
                options={providerOptions()}
                optionValue={p => p}
                optionTextValue={p => p}
                value={llmProvider()}
                onChange={(val) => {
                  setLlmProvider(val ?? null)
                  setModel(null)
                }}
                placeholder="Select provider"
                disallowEmptySelection={false}
                selectionBehavior="toggle"
                itemComponent={props => (
                  <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger aria-label="AI Provider">
                  <SelectValue<string>>
                    {state => state.selectedOption() ?? 'Select provider'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="flex flex-col gap-2">
              <Label>Model</Label>
              <Show
                when={llmProvider() && currentModels().length > 0}
                fallback={(
                  <div class="h-10 flex items-center rounded-md bg-muted/30 px-3">
                    <span class="text-sm text-muted-foreground">Select provider first</span>
                  </div>
                )}
              >
                <Select<ModelConfigObject, ModelConfigObject>
                  options={currentModels()}
                  optionValue={cfg => cfg.value}
                  optionTextValue={cfg => getModelAlias(cfg)}
                  value={selectedModelObject()}
                  onChange={(selected) => {
                    setModel(selected ? selected.value : null)
                    void saveIfChanged()
                  }}
                  placeholder="Select model"
                  disallowEmptySelection={false}
                  selectionBehavior="toggle"
                  itemComponent={props => (
                    <SelectItem item={props.item} class="w-full justify-between">
                      <div class="w-full flex items-center justify-between gap-2">
                        <span>{getModelAlias(props.item.rawValue)}</span>
                        <ModelRatingDisplay model={props.item.rawValue} />
                      </div>
                    </SelectItem>
                  )}
                >
                  <SelectTrigger aria-label="AI Model">
                    <SelectValue<ModelConfigObject>>
                      {(state) => {
                        const opt = state.selectedOption()
                        return opt ? getModelAlias(opt) : 'Select model'
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <Show when={selectedModelObject()}>
                  <div class="mt-2 flex items-center justify-center gap-6 text-xs">
                    <ModelRatingDisplay model={selectedModelObject()!} />
                  </div>
                </Show>
              </Show>
            </div>

            <div class="flex flex-col gap-2">
              <Label>Temperature</Label>
              <NumberField class="w-full" value={temperature()} onChange={val => setTemperature(Number(val))} minValue={0} maxValue={2} step={0.1}>
                <NumberFieldGroup>
                  <NumberFieldInput aria-label="Model temperature" />
                  <NumberFieldDecrementTrigger />
                  <NumberFieldIncrementTrigger />
                </NumberFieldGroup>
              </NumberField>
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div class="border rounded-lg bg-card p-4 shadow-sm">
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
              <Label>Prompt</Label>
              <textarea
                class="min-h-40 w-full border border-input rounded-md bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe the intent, audience, tone, and constraints..."
                value={prompt()}
                onInput={e => setPrompt(e.currentTarget.value)}
                onBlur={saveIfChanged}
              />
            </div>

            <div class="flex items-center gap-2">
              <Button onClick={handlePlan} disabled={!canPlan() || planning()}>
                <span class={planning() ? 'i-svg-spinners:180-ring' : 'i-ph:magic-wand-bold'} />
                <span>Plan with AI</span>
              </Button>
              <Button variant="outline" onClick={handleTestRun} disabled={!canTest() || testing()}>
                <span class={testing() ? 'i-svg-spinners:180-ring' : 'i-ph:robot-bold'} />
                <span>Test run</span>
              </Button>
            </div>
            <Show when={lastRunId()}>
              <p class="text-sm text-muted-foreground">Saved test run: {lastRunId()}</p>
            </Show>
          </div>
        </div>
      </div>

      {/* Results & Live Runner */}
      <div class="grid grid-cols-1 gap-4">
        {/* Plan output */}
        <div class="border rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-medium">Plan output</h3>
            <Show when={lastPlan() || plan()}>
              <span class="text-xs text-muted-foreground">{(lastPlan() ?? plan()) ? `${(lastPlan() ?? plan())!.fields.length} field${((lastPlan() ?? plan())!.fields.length === 1) ? '' : 's'}` : ''}</span>
            </Show>
          </div>
          <Show when={lastPlan() || plan()} fallback={<p class="text-sm text-muted-foreground">No plan yet. Generate one above.</p>}>
            <pre class="max-h-64 overflow-auto rounded bg-muted/30 p-3 text-xs">
              {JSON.stringify((lastPlan() ?? plan()) as any, null, 2)}
            </pre>
          </Show>
        </div>

        {/* Live test runner */}
        <div class="border rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h3 class="mr-auto font-medium">Live test run</h3>
            <Button size="sm" onClick={startLive} disabled={liveRunning() || livePaused() || !llmProvider() || !model() || !plan()}>
              <span class="i-ph:play-bold" />
              <span>Start</span>
            </Button>
            <Button size="sm" variant="outline" onClick={pauseLive} disabled={!liveRunning() || livePaused()}>
              <span class="i-ph:pause-bold" />
              <span>Pause</span>
            </Button>
            <Button size="sm" variant="outline" onClick={resumeLive} disabled={!livePaused()}>
              <span class="i-ph:play-circle-bold" />
              <span>Resume</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={stopLive} disabled={!liveRunning() && !livePaused()}>
              <span class="i-ph:stop-bold" />
              <span>Stop</span>
            </Button>
          </div>
          <div class="mb-2 text-xs text-muted-foreground">
            <span>Status: {liveRunning() ? (livePaused() ? 'Paused' : 'Running') : (liveTranscript().length > 0 ? 'Stopped' : 'Idle')}</span>
            <span class="ml-3">Progress: {liveIndex()} / {liveTotal() ?? '—'}</span>
          </div>
          <div class="flex flex-col gap-2">
            <For each={liveTranscript()}>
              {s => (
                <div class="border rounded-md p-3 text-sm">
                  <div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Step {s.step}</span>
                    <span class="i-ph:robot-duotone" />
                  </div>
                  <div class="font-medium">{s.question.label}</div>
                  <div class="mt-1 text-muted-foreground">Answer: {String(s.answer)}</div>
                </div>
              )}
            </For>
            <Show when={liveRunning() && !livePaused()}>
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <span class="i-svg-spinners:180-ring" />
                <span>Generating next answer…</span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
