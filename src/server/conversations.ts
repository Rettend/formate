import process from 'node:process'
import { action, query } from '@solidjs/router'
import { and, asc, eq } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { getCookie, setCookie } from 'vinxi/http'
import { z } from 'zod'
import { uuidV7Base58 } from '~/lib'
import { generateStructured } from '~/lib/ai'
import { aiErrorToMessage, extractAICause, logAIError } from '~/lib/ai/errors'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { formFieldSchema } from '~/lib/validation/form-plan'
import { ensure } from '~/utils'
import { decryptSecret } from './crypto'
import { db } from './db'
import { Conversations, Forms, Turns } from './db/schema'

interface Identity { userId?: string, inviteJti?: string }

async function getIdentityForForm(formId?: string): Promise<Identity> {
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  let inviteJti: string | undefined
  if (formId) {
    const cookieName = `form_invite_${formId}`
    try {
      const val: any = getCookie(cookieName)
      if (val) {
        // New format: cookie value is the raw JTI
        if (typeof val === 'string' && val.length > 0) {
          // Attempt JSON parse only if it looks like a JSON object (back-compat)
          if (val.startsWith('{')) {
            try {
              const parsed = JSON.parse(val)
              if (parsed && typeof parsed === 'object' && typeof (parsed as any).jti === 'string')
                inviteJti = (parsed as any).jti
            }
            catch {}
          }
          else {
            // Guard against previously malformed cookies where value accidentally contained the cookie name
            if (val === cookieName || val.startsWith('form_invite_')) {
              // Clear invalid cookie and ignore
              try {
                setCookie(cookieName, '', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: new Date(0) } as any)
              }
              catch {}
              inviteJti = undefined
            }
            else {
              inviteJti = val
            }
          }
        }
        else if (val && typeof val === 'object' && typeof val.jti === 'string') {
          // In case some adapter returned an object; be defensive
          inviteJti = val.jti
        }
      }
    }
    catch {}
  }
  return { userId, inviteJti }
}

async function requireSomeIdentity(formId?: string): Promise<Identity> {
  const id = await getIdentityForForm(formId)
  if (!id.userId && !id.inviteJti)
    throw new Error('Unauthorized')
  return id
}

const formIdSchema = z.object({ formId: idSchema })

export const getOrCreateConversation = action(async (raw: { formId: string }) => {
  'use server'
  const { formId } = safeParseOrThrow(formIdSchema, raw, 'conv:getOrCreate')
  const { userId, inviteJti } = await requireSomeIdentity(formId)

  // Ensure form exists and is public+published
  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Error('Form not found')
  // Allow owner to start a conversation even if not published; non-owners require published
  const isOwner = userId && form.ownerUserId === userId
  if (!isOwner && form.status !== 'published')
    throw new Error('Form is not published')

  // Find existing: prefer invite identity if present to avoid mixing with logged-in owner/user sessions
  let existing: any[] = []
  if (inviteJti) {
    existing = await db
      .select()
      .from(Conversations)
      .where(and(eq(Conversations.formId, formId), eq(Conversations.inviteJti, inviteJti)))
      .limit(1)
  }
  else if (userId) {
    existing = await db
      .select()
      .from(Conversations)
      .where(and(eq(Conversations.formId, formId), eq(Conversations.respondentUserId, userId)))
      .limit(1)
  }
  if (existing.length > 0) {
    // ensure first turn exists
    await ensureFirstTurn(existing[0].id, formId)
    return existing[0]
  }

  const [created] = await db.insert(Conversations).values({
    formId,
    respondentUserId: inviteJti ? (null as any) : (userId ?? null as any),
    inviteJti: inviteJti ?? null as any,
    status: 'active',
  }).returning().catch(async (e: any) => {
    const msg = String(e?.message || e)
    // Handle race/duplication gracefully by returning existing conversation
    if (msg.includes('UNIQUE constraint failed')) {
      let rows: any[] = []
      if (inviteJti) {
        rows = await db
          .select()
          .from(Conversations)
          .where(and(eq(Conversations.formId, formId), eq(Conversations.inviteJti, inviteJti)))
          .limit(1)
      }
      else if (userId) {
        rows = await db
          .select()
          .from(Conversations)
          .where(and(eq(Conversations.formId, formId), eq(Conversations.respondentUserId, userId)))
          .limit(1)
      }
      if (rows.length > 0)
        return rows
    }
    throw e
  })

  // ensure first turn exists for new conversation
  await ensureFirstTurn(created.id, formId)
  return created
}, 'conv:getOrCreate')

const listTurnsSchema = z.object({ conversationId: idSchema })

export const listTurns = query(async (raw: { conversationId: string }) => {
  'use server'
  const { conversationId } = safeParseOrThrow(listTurnsSchema, raw, 'conv:listTurns')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  // authorize: either same user or same invite
  const { userId, inviteJti } = await getIdentityForForm(conv.formId)
  const ok = (conv.respondentUserId && conv.respondentUserId === userId) || (conv.inviteJti && conv.inviteJti === inviteJti)
  if (!ok)
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
  const { conversationId, turnId, value } = safeParseOrThrow(answerQuestionSchema, raw, 'conv:answer')
  // Use a transaction so that if AI generation/validation fails,
  // we roll back the turn update and allow retry without leaving the turn answered.
  return db.transaction(async (tx) => {
    const [conv] = await tx.select().from(Conversations).where(eq(Conversations.id, conversationId))
    if (!conv)
      throw new Error('Conversation not found')
    const { userId, inviteJti } = await getIdentityForForm(conv.formId)
    const ok = (conv.respondentUserId && conv.respondentUserId === userId) || (conv.inviteJti && conv.inviteJti === inviteJti)
    if (!ok)
      throw new Error('Forbidden')
    if (conv.status !== 'active')
      throw new Error('Conversation not active')

    const [turn] = await tx.select().from(Turns).where(eq(Turns.id, turnId))
    if (!turn)
      throw new Error('Turn not found')
    if (turn.conversationId !== conversationId)
      throw new Error('Invalid turn')
    if (turn.status !== 'awaiting_answer')
      throw new Error('Turn already answered')

    const answerJson = { value, providedAt: new Date().toISOString() }
    await tx
      .update(Turns)
      .set({ answerJson, status: 'answered', answeredAt: new Date() })
      .where(eq(Turns.id, turnId))

    // Determine next step with stopping criteria
    const answeredIndex = turn.index
    const nextIndex = answeredIndex + 1

    // Load form to read plan/stopping
    const [form] = await tx.select().from(Forms).where(eq(Forms.id, conv.formId))
    if (!form)
      throw new Error('Form not found')

    const { shouldHardStop, maxQuestions } = getHardLimitInfo(form)

    // If asking one more would exceed hard limit, complete now
    if (shouldHardStop(nextIndex)) {
      const [updated] = await tx
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
    const followUp = await createFollowUpTurnOrEndTx(tx, conversationId, nextIndex)
    if (followUp.kind === 'end') {
      const [updated] = await tx
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
  })
}, 'conv:answer')

const completeSchema = z.object({ conversationId: idSchema })

export const completeConversation = action(async (raw: { conversationId: string }) => {
  'use server'
  const { conversationId } = safeParseOrThrow(completeSchema, raw, 'conv:complete')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  const { userId, inviteJti } = await getIdentityForForm(conv.formId)
  const ok = (conv.respondentUserId && conv.respondentUserId === userId) || (conv.inviteJti && conv.inviteJti === inviteJti)
  if (!ok)
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
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = ensure(session?.user?.id, 'Unauthorized')
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

const resetSchema = z.object({ conversationId: idSchema })

// Owner-only: reset entire conversation to the beginning (delete all turns and reinsert seed)
export const resetConversation = action(async (raw: { conversationId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = ensure(session?.user?.id, 'Unauthorized')
  const { conversationId } = safeParseOrThrow(resetSchema, raw, 'conv:reset')

  // Load conversation and form to check ownership
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')
  if (form.ownerUserId !== userId)
    throw new Error('Forbidden')

  // Delete all turns for this conversation
  await db.delete(Turns).where(eq(Turns.conversationId, conversationId))

  // Mark conversation active and clear completion and end metadata
  await db
    .update(Conversations)
    .set({ status: 'active', completedAt: null as any, clientMetaJson: null as any })
    .where(eq(Conversations.id, conversationId))

  // Recreate first turn based on form seed
  await ensureFirstTurn(conversationId, conv.formId)

  // Return the first turn id for focusing
  const first = await db
    .select()
    .from(Turns)
    .where(and(eq(Turns.conversationId, conversationId), eq(Turns.index, 0)))
    .limit(1)

  return { ok: true, firstTurnId: first[0]?.id }
}, 'conv:reset')

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

// Same as createFollowUpTurnOrEnd but scoped to a transaction
async function createFollowUpTurnOrEndTx(tx: any, conversationId: string, indexValue: number): Promise<
  | { kind: 'turn', turn: any }
  | { kind: 'end', reason: Exclude<EndReason, 'hard_limit'>, modelId?: string }
> {
  const [conv] = await tx.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')

  const [form] = await tx.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')

  const priorTurns = await tx
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  const history = priorTurns
    .filter((t: any) => t.index <= indexValue - 1)
    .map((t: any) => ({
      index: t.index,
      question: t.questionJson ? (t.questionJson as any) : undefined,
      answer: t.answerJson ? (t.answerJson as any).value : undefined,
    }))

  const provider = (form as any).aiConfigJson?.provider as string | undefined
  const modelId = (form as any).aiConfigJson?.modelId as string | undefined
  const prompt = (form as any).aiConfigJson?.prompt as string | undefined

  const stopping = getStopping((form as any).settingsJson)

  if (!provider || !modelId || !prompt)
    throw new Error('AI not configured for this form')

  const system = `You are an expert adaptive interview designer. Given the form's goal and a transcript of previous Q/A, craft the single next best question.
Prefer conversational, open-ended prompts. Default to long_text unless there's a clear reason to use another type.
You may also decide to end the form early if you have enough information or the respondent is clearly not engaging.`

  const user = {
    formGoalPrompt: prompt,
    planSummary: (form as any).settingsJson?.summary ?? undefined,
    constraints: {
      allowedTypes: ['short_text', 'long_text', 'multiple_choice', 'boolean', 'rating', 'number', 'multi_select'],
      maxOptions: 6,
      preferLongTextByDefault: true,
    },
    earlyEnd: {
      allowed: Boolean(stopping.llmMayEnd),
      reasons: stopping.endReasons,
    },
    history: history.map((h: any) => ({
      index: h.index,
      question: h.question ? { label: (h.question as any).label, type: (h.question as any).type } : undefined,
      answer: h.answer,
    })),
  }

  const endSchema = z.object({ end: z.object({ reason: z.enum(['enough_info', 'trolling']) }) })
  const unionSchema = z.union([formFieldSchema, endSchema])
  const schema = stopping.llmMayEnd ? unionSchema : formFieldSchema

  let resp
  try {
    // Decrypt per-form provider key if available
    let apiKey: string | undefined
    try {
      const enc: string | undefined = (form as any).aiProviderKeyEnc
      if (enc && typeof enc === 'string' && enc.length > 0)
        apiKey = await decryptSecret(enc)
    }
    catch (e) {
      // If decryption fails, continue without apiKey so provider default applies
      console.error('[conv] Failed to decrypt provider key:', e)
    }

    resp = await generateStructured({
      schema,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
      provider,
      modelId,
      apiKey,
    })
  }
  catch (err) {
    logAIError(err, 'conv:generateFollowUp')
    const cause = extractAICause(err)
    const code = (typeof cause === 'string' && cause.toLowerCase().includes('validation')) ? 'VALIDATION_FAILED' : 'AI_ERROR'
    const payload = { code, message: aiErrorToMessage(err), cause }
    throw new Error(JSON.stringify(payload))
  }

  const obj: any = resp.object

  if (stopping.llmMayEnd && obj && typeof obj === 'object' && (obj.end?.reason === 'enough_info' || obj.end?.reason === 'trolling')) {
    if (Array.isArray(stopping.endReasons) && stopping.endReasons.includes(obj.end.reason))
      return { kind: 'end', reason: obj.end.reason, modelId }
  }

  const question = {
    ...obj,
    id: uuidV7Base58(),
  }

  const [created] = await tx.insert(Turns).values({
    conversationId,
    index: indexValue,
    questionJson: question as any,
    status: 'awaiting_answer',
  }).returning()
  return { kind: 'turn', turn: created }
}
