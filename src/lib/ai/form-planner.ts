import type { Provider } from './lists'
import type { ModelMessage } from '~/lib/ai'
import type { FormField, FormPlan, TestRunStep } from '~/lib/validation/form-plan'
import { z } from 'zod'
import { generateStructured } from '~/lib/ai'
import { formFieldSchema, formPlanSchema, testRunTranscriptSchema } from '~/lib/validation/form-plan'

const SYSTEM_INSTRUCTIONS = `You are an expert interview/form designer.
Write a a form intro, outro, and form summary for the respondents.
Design a concise, open-ended seed question (type long_text by default) as the first, warm-up question for the form.
Use only these field types: short_text, long_text, multiple_choice, multi_select, boolean, rating, number.`

function buildPlanningMessages(prompt: string): ModelMessage[] {
  return [
    { role: 'system', content: SYSTEM_INSTRUCTIONS },
    {
      role: 'user',
      content: `Goal & constraints (single prompt):\n${prompt}\n\nOutput a JSON object matching the provided schema strictly.`,
    },
  ]
}

const formPlanCoreSchema = z.object({
  summary: formPlanSchema.shape.summary,
  intro: formPlanSchema.shape.intro,
  outro: formPlanSchema.shape.outro,
  seed: formFieldSchema,
})

export async function planFormWithLLM(options: {
  prompt: string
  provider: Provider
  modelId: string
  temperature?: number
  apiKey?: string
}): Promise<{ plan: FormPlan, tokensIn?: number, tokensOut?: number }> {
  const { object } = await generateStructured({
    schema: formPlanCoreSchema,
    messages: buildPlanningMessages(options.prompt),
    provider: options.provider,
    modelId: options.modelId,
    apiKey: options.apiKey,
    providerOptions: { temperature: typeof options.temperature === 'number' ? options.temperature : 0.5 },
  })
  return { plan: object as FormPlan }
}

export async function simulateTestRun(options: {
  plan: FormPlan
  provider: Provider
  modelId: string
  maxSteps?: number
  signal?: AbortSignal
  apiKey?: string
}): Promise<{ transcript: TestRunStep[], tokensIn?: number, tokensOut?: number }> {
  const steps: TestRunStep[] = []
  const f = options.plan.seed
  const max = Math.min(options.maxSteps ?? 1, 1)

  for (let i = 0; i < max; i++) {
    const q = `${f.label}${f.required ? ' (required)' : ''}`
    const answerSchema = z.object({ answer: z.union([z.string(), z.number(), z.boolean()]) })
    const { object } = await generateStructured({
      schema: answerSchema,
      provider: options.provider,
      modelId: options.modelId,
      apiKey: options.apiKey,
      messages: [
        { role: 'system', content: 'Answer concisely as a realistic respondent. No preface, only the answer. Return only JSON.' },
        { role: 'user', content: `Question: ${q}\nType: ${f.type}\nOptions (if any): ${(f.options ?? []).map(o => o.label).join(', ')}` },
      ],
      providerOptions: { temperature: 0.5 },
    })
    steps.push({ step: i + 1, question: f, answer: (object as any).answer })
  }

  // Validate before returning
  // TODO: AI SDK already validates input and output -> delete
  const transcript = testRunTranscriptSchema.parse(steps)
  return { transcript }
}

export async function simulateTestStep(options: {
  plan: FormPlan
  index: number
  provider: Provider
  modelId: string
  apiKey?: string
}): Promise<TestRunStep> {
  const i = options.index
  if (i !== 0)
    throw new Error('Index out of range')
  const f: FormField = options.plan.seed
  const q = `${f.label}${f.required ? ' (required)' : ''}`
  const answerSchema = z.object({ answer: z.union([z.string(), z.number(), z.boolean()]) })
  const { object } = await generateStructured({
    schema: answerSchema,
    provider: options.provider,
    modelId: options.modelId,
    apiKey: options.apiKey,
    messages: [
      { role: 'system', content: 'You are role-playing as a survey respondent.' },
      { role: 'user', content: `Question: ${q}\nType: ${f.type}\nOptions (if any): ${(f.options ?? []).map(o => o.label).join(', ')}` },
    ],
    providerOptions: { temperature: 0.5 },
  })
  const step: TestRunStep = { step: i + 1, question: f, answer: (object as any).answer }
  return step
}
