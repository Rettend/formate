import { action, query } from '@solidjs/router'
import { and, asc, eq } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'
import { uuidV7Base58 } from '~/lib'
import { generateStructured } from '~/lib/ai'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { formFieldSchema } from '~/lib/validation/form-plan'
import { ensure } from '~/utils'
import { db } from './db'
import { Conversations, Forms, Turns } from './db/schema'

async function requireUserId(): Promise<string> {
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const id = session?.user?.id
  return ensure(id, 'Unauthorized')
}

const formIdSchema = z.object({ formId: idSchema })

export const getOrCreateConversation = action(async (raw: { formId: string }) => {
  'use server'
  const userId = await requireUserId()
  const { formId } = safeParseOrThrow(formIdSchema, raw, 'conv:getOrCreate')

  // Ensure form exists and is public+published
  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Error('Form not found')
  // Allow owner to start a conversation even if not published; non-owners require published
  const isOwner = form.ownerUserId === userId
  if (!isOwner && form.status !== 'published')
    throw new Error('Form is not published')

  // Find existing
  const existing = await db
    .select()
    .from(Conversations)
    .where(and(eq(Conversations.formId, formId), eq(Conversations.respondentUserId, userId)))
    .limit(1)
  if (existing.length > 0) {
    // ensure first turn exists
    await ensureFirstTurn(existing[0].id, formId)
    return existing[0]
  }

  const [created] = await db.insert(Conversations).values({
    formId,
    respondentUserId: userId,
    status: 'active',
  }).returning()

  // ensure first turn exists for new conversation
  await ensureFirstTurn(created.id, formId)
  return created
}, 'conv:getOrCreate')

const listTurnsSchema = z.object({ conversationId: idSchema })

export const listTurns = query(async (raw: { conversationId: string }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId } = safeParseOrThrow(listTurnsSchema, raw, 'conv:listTurns')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  if (conv.respondentUserId !== userId)
    throw new Error('Forbidden')

  const items = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  return { items }
}, 'conv:listTurns')

const answerQuestionSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
})

export const answerQuestion = action(async (raw: { conversationId: string, turnId: string, value: string | number | boolean }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId, turnId, value } = safeParseOrThrow(answerQuestionSchema, raw, 'conv:answer')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  if (conv.respondentUserId !== userId)
    throw new Error('Forbidden')
  if (conv.status !== 'active')
    throw new Error('Conversation not active')

  const [turn] = await db.select().from(Turns).where(eq(Turns.id, turnId))
  if (!turn)
    throw new Error('Turn not found')
  if (turn.conversationId !== conversationId)
    throw new Error('Invalid turn')
  if (turn.status !== 'awaiting_answer')
    throw new Error('Turn already answered')

  const answerJson = { value, providedAt: new Date().toISOString() }
  await db
    .update(Turns)
    .set({ answerJson, status: 'answered', answeredAt: new Date() })
    .where(eq(Turns.id, turnId))

  // Determine next step with stopping criteria
  const answeredIndex = turn.index
  const nextIndex = answeredIndex + 1

  // Load form to read plan/stopping
  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')

  const { shouldHardStop, maxQuestions } = getHardLimitInfo(form)

  // If asking one more would exceed hard limit, complete now
  if (shouldHardStop(nextIndex)) {
    const [updated] = await db
      .update(Conversations)
      .set({
        status: 'completed',
        completedAt: new Date(),
        clientMetaJson: mergeEndMeta(conv.clientMetaJson, { reason: 'hard_limit', atTurn: answeredIndex }),
      } as any)
      .where(eq(Conversations.id, conversationId))
      .returning()
    return { completed: Boolean(updated), reason: 'hard_limit', maxQuestions }
  }

  // Otherwise, ask the LLM for the next question or end signal
  const followUp = await createFollowUpTurnOrEnd(conversationId, nextIndex)
  if (followUp.kind === 'end') {
    const [updated] = await db
      .update(Conversations)
      .set({
        status: 'completed',
        completedAt: new Date(),
        clientMetaJson: mergeEndMeta(conv.clientMetaJson, { reason: followUp.reason, atTurn: answeredIndex, modelId: followUp.modelId }),
      } as any)
      .where(eq(Conversations.id, conversationId))
      .returning()
    return { completed: Boolean(updated), reason: followUp.reason }
  }

  return { nextTurn: followUp.turn }
}, 'conv:answer')

const completeSchema = z.object({ conversationId: idSchema })

export const completeConversation = action(async (raw: { conversationId: string }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId } = safeParseOrThrow(completeSchema, raw, 'conv:complete')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  if (conv.respondentUserId !== userId)
    throw new Error('Forbidden')

  const [updated] = await db
    .update(Conversations)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(Conversations.id, conversationId))
    .returning()

  return { ok: Boolean(updated) }
}, 'conv:complete')

const rewindSchema = z.object({ conversationId: idSchema })

// Owner-only: delete current active question and reopen previous question
export const rewindOneStep = action(async (raw: { conversationId: string }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId } = safeParseOrThrow(rewindSchema, raw, 'conv:rewind')

  // Load conversation and form to check ownership
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')
  if (form.ownerUserId !== userId)
    throw new Error('Forbidden')

  // Fetch turns ordered by index
  const turns = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  const active = turns.find(t => t.status === 'awaiting_answer')
  if (active) {
    // Normal case: step back from an active turn to the previous one
    if (active.index <= 0)
      throw new Error('No previous question')

    const prev = turns.find(t => t.index === active.index - 1)
    if (!prev)
      throw new Error('Previous question not found')

    // Delete current active question (it is the latest turn by design)
    await db
      .delete(Turns)
      .where(eq(Turns.id, active.id))

    // Reopen previous: clear answer and set awaiting
    const [updatedPrev] = await db
      .update(Turns)
      .set({ status: 'awaiting_answer', answerJson: null as any, answeredAt: null as any })
      .where(eq(Turns.id, prev.id))
      .returning()

    // Ensure conversation is active
    await db
      .update(Conversations)
      .set({ status: 'active', completedAt: null as any })
      .where(eq(Conversations.id, conversationId))

    return { ok: true, reopenedTurnId: updatedPrev?.id }
  }

  // Completed (or no active) case: reopen the last answered turn
  if (turns.length === 0)
    throw new Error('No questions to rewind')

  const last = turns[turns.length - 1]

  const [updatedLast] = await db
    .update(Turns)
    .set({ status: 'awaiting_answer', answerJson: null as any, answeredAt: null as any })
    .where(eq(Turns.id, last.id))
    .returning()

  await db
    .update(Conversations)
    .set({ status: 'active', completedAt: null as any })
    .where(eq(Conversations.id, conversationId))

  return { ok: true, reopenedTurnId: updatedLast?.id }
}, 'conv:rewind')

// Helpers
async function ensureFirstTurn(conversationId: string, formId: string) {
  const existing = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .limit(1)
  if (existing.length > 0)
    return

  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Error('Form not found')
  const seed = (form as any).seedQuestionJson
  if (!seed)
    throw new Error('Missing seed question')

  await db.insert(Turns).values({
    conversationId,
    index: 0,
    questionJson: seed as any,
    status: 'awaiting_answer',
  })
}

type EndReason = 'enough_info' | 'trolling' | 'hard_limit'

function getStopping(plan: any | undefined) {
  const s = plan?.stopping ?? {}
  return {
    hardLimit: {
      maxQuestions: Math.min(50, Math.max(1, Number(s?.hardLimit?.maxQuestions ?? 10))),
    },
    llmMayEnd: s?.llmMayEnd ?? true,
    endReasons: Array.isArray(s?.endReasons) && s.endReasons.length > 0 ? s.endReasons : ['enough_info', 'trolling'],
  }
}

function getHardLimitInfo(form: any) {
  const stopping = getStopping(form?.settingsJson)
  const maxQuestions = stopping.hardLimit.maxQuestions
  const shouldHardStop = (nextIndex: number) => {
    const totalIfNext = nextIndex + 1
    return totalIfNext > maxQuestions
  }
  return { stopping, maxQuestions, shouldHardStop }
}

function mergeEndMeta(prev: any, meta: { reason: EndReason, atTurn: number, modelId?: string }) {
  const base = (prev && typeof prev === 'object') ? prev : {}
  return { ...base, end: { ...(base.end || {}), ...meta } }
}

async function createFollowUpTurnOrEnd(conversationId: string, indexValue: number): Promise<
  | { kind: 'turn', turn: any }
  | { kind: 'end', reason: Exclude<EndReason, 'hard_limit'>, modelId?: string }
> {
  // Gather context: conversation, form (incl. AI config + plan), past Q/A turns
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')

  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')

  // Load prior turns to build history
  const priorTurns = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  const history = priorTurns
    .filter(t => t.index <= indexValue - 1)
    .map(t => ({
      index: t.index,
      question: t.questionJson ? (t.questionJson as any) : undefined,
      answer: t.answerJson ? (t.answerJson as any).value : undefined,
    }))

  // Require LLM configuration
  const provider = (form as any).aiConfigJson?.provider as string | undefined
  const modelId = (form as any).aiConfigJson?.modelId as string | undefined
  const prompt = (form as any).aiConfigJson?.prompt as string | undefined

  const stopping = getStopping((form as any).settingsJson)

  if (!provider || !modelId || !prompt)
    throw new Error('AI not configured for this form')

  // Prepare messages for the LLM
  const system = `You are an expert adaptive survey designer. Given the form's goal and a transcript of previous Q/A, craft the single next best question.
You may also decide to end the form early if you have enough information or the respondent is clearly not engaging.`

  const user = {
    formGoalPrompt: prompt,
    planSummary: (form as any).settingsJson?.summary ?? undefined,
    constraints: {
      allowedTypes: ['short_text', 'long_text', 'multiple_choice', 'checkbox', 'rating', 'number'],
      maxOptions: 6,
      preferShortWhenUnsure: true,
    },
    earlyEnd: {
      allowed: Boolean(stopping.llmMayEnd),
      reasons: stopping.endReasons,
    },
    history: history.map(h => ({
      index: h.index,
      question: h.question ? { label: (h.question as any).label, type: (h.question as any).type } : undefined,
      answer: h.answer,
    })),
  }

  const endSchema = z.object({ end: z.object({ reason: z.enum(['enough_info', 'trolling']) }) })
  const unionSchema = z.union([formFieldSchema, endSchema])
  const schema = stopping.llmMayEnd ? unionSchema : formFieldSchema

  const resp = await generateStructured({
    schema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(user) },
    ],
    provider,
    modelId,
  })

  const obj: any = resp.object

  // If the model returned an object with an "__end__" marker or a minimal end shape (end.reason), treat as end
  if (stopping.llmMayEnd && obj && typeof obj === 'object' && (obj.end?.reason === 'enough_info' || obj.end?.reason === 'trolling')) {
    if (Array.isArray(stopping.endReasons) && stopping.endReasons.includes(obj.end.reason))
      return { kind: 'end', reason: obj.end.reason, modelId }
  }

  // Otherwise, treat as question and insert
  const question = {
    ...obj,
    id: uuidV7Base58(),
  }

  const [created] = await db.insert(Turns).values({
    conversationId,
    index: indexValue,
    questionJson: question as any,
    status: 'awaiting_answer',
  }).returning()
  return { kind: 'turn', turn: created }
}
