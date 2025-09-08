import type { Provider } from './lists'
import { z } from 'zod'
import { generateFollowUpObject } from '~/lib/ai/follow-up'

export interface SummaryHistoryItem {
  index: number
  question?: { label: string }
  answer?: unknown
}

export async function generateResponseSummary(options: {
  provider: Provider
  modelId: string
  apiKeyEnc?: string | null
  formGoalPrompt: string
  planSummary?: string
  history: SummaryHistoryItem[]
}): Promise<string[]> {
  const { provider, modelId, apiKeyEnc, formGoalPrompt, planSummary, history } = options

  const system = `Summarize the interview into concise, high-signal bullet points.
Rules:
- 3 to 8 bullets, each 6-16 words.
- Actionable, specific, and neutral tone. Avoid speculation and fluff.
- No PII, no quotes, no model self-references.
- Prefer present tense; reflect actual respondent statements (not intentions).
- Focus on clear problems, goals, constraints, behaviors, and potential opportunities.`

  const userPayload = {
    context: {
      goal: formGoalPrompt,
      planSummary: planSummary ?? undefined,
    },
    transcript: history.map(h => ({ index: h.index, question: h.question?.label, answer: h.answer })),
    output: { bullets: { min: 3, max: 8 } }, // TODO: make this configurable
  }

  const isFormateProvider = provider === 'formate'
  const bulletsSchema = z.array(z.string().min(3).max(200)).min(3).max(8)
  const schema = isFormateProvider ? z.object({ output: bulletsSchema }) : bulletsSchema

  const obj = await generateFollowUpObject({
    provider,
    modelId,
    apiKeyEnc: apiKeyEnc ?? undefined,
    system,
    userPayload,
    schema,
    isFormateProvider,
    mode: 'auto',
    logContext: 'conv:generateSummary',
  })

  const bullets = Array.isArray(obj) ? obj : (obj?.output as string[] | undefined)
  return Array.isArray(bullets) ? bullets : []
}

export async function generateFormInsights(options: {
  provider: Provider
  modelId: string
  apiKeyEnc?: string | null
  formGoalPrompt: string
  planSummary?: string
  transcriptSamples: Array<Array<{ index: number, question?: { label: string }, answer?: unknown }>>
}): Promise<string[]> {
  const { provider, modelId, apiKeyEnc, formGoalPrompt, planSummary, transcriptSamples } = options

  const system = `Summarize insights across multiple respondent transcripts.
Rules:
- 5 to 10 bullets; concise, concrete, neutral tone;
- Highlight recurring themes, pain points, surprising divergences, and actionable opportunities;
- No PII, speculation, or quotes.`

  const userPayload = {
    context: {
      goal: formGoalPrompt,
      planSummary: planSummary ?? undefined,
    },
    samples: transcriptSamples.map(s => s.map(t => ({ q: t.question?.label, a: t.answer }))),
    output: { bullets: { min: 5, max: 10 } }, // TODO: make this configurable
  }

  const isFormateProvider = provider === 'formate'
  const bulletsSchema = z.array(z.string().min(3).max(300)).min(5).max(10)
  const schema = isFormateProvider ? z.object({ output: bulletsSchema }) : bulletsSchema

  const obj = await generateFollowUpObject({
    provider,
    modelId,
    apiKeyEnc: apiKeyEnc ?? undefined,
    system,
    userPayload,
    schema,
    isFormateProvider,
    mode: 'auto',
    logContext: 'analytics:generateFormInsights',
  })

  const bullets = Array.isArray(obj) ? obj : (obj?.output as string[] | undefined)
  return Array.isArray(bullets) ? bullets : []
}
