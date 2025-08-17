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
  if (form.status !== 'published')
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

  // Determine next step (based on answered turn index)
  const answeredIndex = turn.index

  // For the first iteration: create exactly one follow-up after the seed, then complete
  if (answeredIndex === 0) {
    const next = await createFollowUpTurn(conversationId, 1)
    return { nextTurn: next }
  }

  // No more turns -> complete conversation
  const [updated] = await db
    .update(Conversations)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(Conversations.id, conversationId))
    .returning()

  return { completed: Boolean(updated) }
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
  if (!active)
    throw new Error('No active question to rewind')
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

async function createFollowUpTurn(conversationId: string, indexValue: number) {
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

  async function insert(question: any) {
    const [created] = await db.insert(Turns).values({
      conversationId,
      index: indexValue,
      questionJson: question as any,
      status: 'awaiting_answer',
    }).returning()
    return created
  }

  if (!provider || !modelId || !prompt)
    throw new Error('AI not configured for this form')

  // Prepare messages for the LLM
  const system = `You are an expert adaptive survey designer. Given a form's goal and a transcript of previous Q/A, craft the single next best question.
Return ONLY a JSON object that matches the exact schema. Do not include any prose. Keep it concise, clear, and non-leading.`

  const user = {
    formGoalPrompt: prompt,
    planSummary: (form as any).settingsJson?.summary ?? undefined,
    constraints: {
      allowedTypes: ['short_text', 'long_text', 'multiple_choice', 'checkbox', 'rating', 'number'],
      maxOptions: 6,
      preferShortWhenUnsure: true,
    },
    history: history.map(h => ({
      index: h.index,
      question: h.question ? { label: (h.question as any).label, type: (h.question as any).type } : undefined,
      answer: h.answer,
    })),
  }

  const { object } = await generateStructured({
    schema: formFieldSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(user) },
    ],
    provider,
    modelId,
  })

  const question = {
    ...object,
    id: uuidV7Base58(),
  }
  return insert(question)
}
