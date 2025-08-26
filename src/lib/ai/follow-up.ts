import type { Provider } from './lists'
import type { FormField } from '~/lib/validation/form-plan'
import { z } from 'zod'
import { generateStructured } from '~/lib/ai'
import { aiErrorToMessage, extractAICause, logAIError } from '~/lib/ai/errors'
import { formFieldSchema } from '~/lib/validation/form-plan'
import { decryptSecret } from '~/server/crypto'

export interface GenerateFollowUpOptions {
  provider: Provider
  modelId: string
  /** Encrypted API key stored on the form (non-formate providers). */
  apiKeyEnc?: string | null
  /** System instructions string. */
  system: string
  /** Arbitrary user payload object (will be JSON-stringified). */
  userPayload: unknown
  /** Zod schema to validate the model output against. */
  schema: z.ZodTypeAny
  /** Whether provider is the built-in formate (Azure) provider. Controls output shape handling. */
  isFormateProvider: boolean
  /** Optional context tag for error logs. */
  logContext?: string
  /** Mode to use for the model. */
  mode?: 'json' | 'tool' | 'auto'
}

export async function generateFollowUpObject(options: GenerateFollowUpOptions): Promise<any> {
  const { provider, modelId, apiKeyEnc, system, userPayload, schema, isFormateProvider, logContext, mode } = options

  try {
    let apiKey: string | undefined
    if (apiKeyEnc && typeof apiKeyEnc === 'string' && apiKeyEnc.length > 0) {
      try {
        apiKey = await decryptSecret(apiKeyEnc)
      }
      catch (e) {
        console.error('[conv] Failed to decrypt provider key:', e)
      }
    }

    const resp = await generateStructured({
      schema,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      provider,
      modelId,
      apiKey,
      mode,
    })

    return isFormateProvider ? (resp as any).object.output : (resp as any).object
  }
  catch (err) {
    logAIError(err, logContext ?? 'conv:generateFollowUp')
    const cause = extractAICause(err)
    const code = (typeof cause === 'string' && cause.toLowerCase().includes('validation')) ? 'VALIDATION_FAILED' : 'AI_ERROR'
    const payload = { code, message: aiErrorToMessage(err), cause }
    throw new Error(JSON.stringify(payload))
  }
}

export interface PriorTurnDigest {
  index: number
  question?: { label: string, type: FormField['type'] } | undefined
  answer?: unknown
}

export interface StoppingConfig {
  hardLimit: { maxQuestions: number }
  llmMayEnd: boolean
  endReasons: Array<'enough_info' | 'trolling'>
}

export interface GenerateInterviewFollowUpInput {
  provider: Provider
  modelId: string
  apiKeyEnc?: string | null
  formGoalPrompt: string
  planSummary?: string
  stopping: StoppingConfig
  indexValue: number
  /** Count of all prior turns in the conversation. */
  priorCount: number
  /** History up to the previous turn (<= indexValue - 1). */
  history: PriorTurnDigest[]
  /** Previous plan string if any. */
  previousPlan?: string
}

export type InterviewFollowUpResult
  = | { kind: 'end', reason: 'enough_info' | 'trolling', modelId: string }
    | { kind: 'turn', question: FormField, plan?: string, modelId: string }

export async function generateInterviewFollowUp(input: GenerateInterviewFollowUpInput): Promise<InterviewFollowUpResult> {
  const { provider, modelId, apiKeyEnc, formGoalPrompt, planSummary, stopping, indexValue, priorCount, history, previousPlan } = input

  const system = `You are an expert user researcher conducting an interview based on "The Mom Test" methodology. Your goal is to understand the user's life, problems, and past behaviors.

Given the form's goal, the conversation history, and your previous plan, you will do two things:
1. Formulate a new plan: Create a single-sentence internal goal for your next question. This is your hypothesis or the main thing you want to learn next. If the previous plan is still relevant, you can continue it. If the user's answer revealed a more important topic, create a new plan.
2. Craft the next question: Ask a single, open-ended question that directly serves your new plan.

Guiding Principles:
- Talk about their life, not our idea.
- Ask about specifics in the past and present, not opinions about the future.
- Focus on pain points. When a user mentions a problem, your plan should be to ask a follow-up question that digs deeper, but only one.
- Do not get stuck on a single topic, after 2 questions, think of a new plan.

Rules for Crafting Questions:
- Avoid Hypotheticals
- Focus On The Past/Present
- Listen for emotion. When a user expresses frustration or boredom, your plan should investigate that feeling.
- Pain Meter: When the user mentions a frustration, workaround, or inefficiency, try to quantify it concisely in the plan: frequency (e.g. times/week), cost (time/money/energy), and consequences/impact. You might have uncovered a pain point, but *how* painful is it? just a mild inconvenience or a major issue?

Defaults and Constraints:
- Prefer conversational, open-ended prompts.
- Default field type to long_text unless there is a clear reason to use another type from the allowed set.

Return a question for the user and a plan for the next turn. You may also decide to end the interview early if you have enough information or the user is clearly not engaged.`

  const maxQuestions = stopping.hardLimit.maxQuestions
  const questionsLeft = Math.max(0, maxQuestions - priorCount)

  const user = {
    formGoalPrompt,
    planSummary: planSummary ?? undefined,
    constraints: {
      allowedTypes: ['short_text', 'long_text', 'multiple_choice', 'boolean', 'rating', 'number', 'multi_select'],
      maxOptions: 6,
    },
    earlyEnd: {
      allowed: Boolean(stopping.llmMayEnd),
      reasons: stopping.endReasons,
    },
    previousPlan,
    progress: {
      maxQuestions,
      questionsLeft,
      nextQuestionNumber: indexValue + 1,
    },
    history: history.map(h => ({
      index: h.index,
      question: h.question ? { label: h.question.label, type: h.question.type } : undefined,
      answer: h.answer,
    })),
  }

  const endSchema = z.object({ end: z.object({ reason: z.enum(['enough_info', 'trolling']) }) })
  const turnSchema = z.object({
    question: formFieldSchema,
    plan: z.string().min(1).describe('A single sentence explaining your internal goal for asking this question.'),
  })

  const isFormateProvider = provider === 'formate'
  let schema: z.ZodTypeAny
  if (stopping.llmMayEnd) {
    schema = isFormateProvider
      ? z.object({ output: z.union([turnSchema, endSchema]) })
      : z.union([turnSchema, endSchema])
  }
  else {
    schema = turnSchema
  }

  const obj = await generateFollowUpObject({
    provider,
    modelId,
    apiKeyEnc: apiKeyEnc ?? undefined,
    system,
    userPayload: user,
    schema,
    isFormateProvider,
    mode: 'auto',
    logContext: 'conv:generateFollowUp',
  })

  if (stopping.llmMayEnd && obj && typeof obj === 'object' && (obj.end?.reason === 'enough_info' || obj.end?.reason === 'trolling')) {
    if (Array.isArray(stopping.endReasons) && stopping.endReasons.includes(obj.end.reason))
      return { kind: 'end', reason: obj.end.reason, modelId }
  }

  const question = obj.question as FormField
  const plan = (obj as any).plan as string | undefined
  return { kind: 'turn', question, plan, modelId }
}
