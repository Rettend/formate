import type { Provider } from '~/lib/ai/lists'
import process from 'node:process'
import { action, query } from '@solidjs/router'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { getCookie, setCookie } from 'vinxi/http'
import { z } from 'zod'
import { uuidV7Base58 } from '~/lib'
import { generateInterviewFollowUp } from '~/lib/ai/follow-up'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { ensure } from '~/utils'
import { assertProviderAllowedForUser } from './ai'
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

  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))

  const items = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  let remainingBack: number | null = null
  try {
    if (form) {
      const isOwner = Boolean(userId && form.ownerUserId === userId)
      if (!isOwner) {
        const limit = getRespondentBackLimit(form)
        const used = getRespondentBackUsedCount(conv.clientMetaJson)
        remainingBack = Math.max(0, limit - used)
      }
    }
  }
  catch {}

  return { items, remainingBack, status: conv.status }
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

    // Capture previous answer value before clearing
    const prevAnswerValue = (prev as any)?.answerJson?.value

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

    return { ok: true, reopenedTurnId: updatedPrev?.id, previousAnswer: prevAnswerValue }
  }

  // Completed (or no active) case: reopen the last answered turn
  if (turns.length === 0)
    throw new Error('No questions to rewind')

  const last = turns[turns.length - 1]
  const lastAnswerValue = (last as any)?.answerJson?.value

  const [updatedLast] = await db
    .update(Turns)
    .set({ status: 'awaiting_answer', answerJson: null as any, answeredAt: null as any })
    .where(eq(Turns.id, last.id))
    .returning()

  await db
    .update(Conversations)
    .set({ status: 'active', completedAt: null as any })
    .where(eq(Conversations.id, conversationId))

  return { ok: true, reopenedTurnId: updatedLast?.id, previousAnswer: lastAnswerValue }
}, 'conv:rewind')

// Respondent-limited rewind: allow a non-owner respondent to go back if the form settings permit it.
export const respondentRewind = action(async (raw: { conversationId: string }) => {
  'use server'
  const { conversationId } = safeParseOrThrow(rewindSchema, raw, 'conv:respondentRewind')

  // Load conversation and associated form
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  const [form] = await db.select().from(Forms).where(eq(Forms.id, conv.formId))
  if (!form)
    throw new Error('Form not found')

  // Auth: respondent must match either the logged-in user or invite cookie for this form
  const { userId, inviteJti } = await getIdentityForForm(conv.formId)
  const isOwner = Boolean(userId && form.ownerUserId === userId)
  const isRespondent = (conv.respondentUserId && conv.respondentUserId === userId) || (conv.inviteJti && conv.inviteJti === inviteJti)
  if (!isRespondent)
    throw new Error('Forbidden')
  // Owners should use the admin rewind endpoint
  if (isOwner)
    throw new Error('Use owner rewind')

  // Enforce per-form limit
  const limit = getRespondentBackLimit(form)
  if (limit <= 0)
    throw new Error('Back not allowed')

  // Count how many answered turns are available to step back from
  const turns = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  const active = turns.find(t => t.status === 'awaiting_answer')
  const answered = turns.filter(t => t.status === 'answered')

  // Determine how many "back" operations have been already used by looking for reopened answers in clientMetaJson
  const used = getRespondentBackUsedCount(conv.clientMetaJson)
  if (used >= limit)
    throw new Error('Back limit reached')

  // If there's an active turn, delete it and reopen previous answered; else reopen the last answered
  if (active) {
    if (active.index <= 0)
      throw new Error('No previous question')
    const prev = turns.find(t => t.index === active.index - 1)
    if (!prev)
      throw new Error('Previous question not found')

    const prevAnswerValue = (prev as any)?.answerJson?.value

    await db.delete(Turns).where(eq(Turns.id, active.id))
    const [updatedPrev] = await db
      .update(Turns)
      .set({ status: 'awaiting_answer', answerJson: null as any, answeredAt: null as any })
      .where(eq(Turns.id, prev.id))
      .returning()

    // Track usage
    await db
      .update(Conversations)
      .set({ status: 'active', completedAt: null as any, clientMetaJson: setRespondentBackUsed(conv.clientMetaJson, used + 1) as any })
      .where(eq(Conversations.id, conversationId))

    return { ok: true, reopenedTurnId: updatedPrev?.id, remaining: Math.max(0, limit - (used + 1)), previousAnswer: prevAnswerValue }
  }

  if (answered.length === 0)
    throw new Error('No questions to rewind')

  const last = answered[answered.length - 1]
  const lastAnswerValue = (last as any)?.answerJson?.value
  const [updatedLast] = await db
    .update(Turns)
    .set({ status: 'awaiting_answer', answerJson: null as any, answeredAt: null as any })
    .where(eq(Turns.id, last.id))
    .returning()

  await db
    .update(Conversations)
    .set({ status: 'active', completedAt: null as any, clientMetaJson: setRespondentBackUsed(conv.clientMetaJson, used + 1) as any })
    .where(eq(Conversations.id, conversationId))

  return { ok: true, reopenedTurnId: updatedLast?.id, remaining: Math.max(0, limit - (used + 1)), previousAnswer: lastAnswerValue }
}, 'conv:respondentRewind')

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

const deleteSchema = z.object({ conversationId: idSchema })

export const deleteConversation = action(async (raw: { conversationId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = ensure(session?.user?.id, 'Unauthorized')
  const { conversationId } = safeParseOrThrow(deleteSchema, raw, 'conv:delete')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    return { ok: true }
  const [form] = await db.select().from(Forms).where(eq(Forms.id, (conv as any).formId))
  if (!form)
    throw new Error('Form not found')
  if ((form as any).ownerUserId !== userId)
    throw new Error('Forbidden')

  await db.delete(Conversations).where(eq(Conversations.id, conversationId))

  return { ok: true }
}, 'conv:delete')

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
  const base = parseMeta(prev)
  return { ...base, end: { ...(base.end || {}), ...meta } }
}

function getRespondentBackLimit(form: any): number {
  const lim = Number((form as any)?.settingsJson?.access?.respondentBackLimit ?? 0)
  if (Number.isFinite(lim))
    return Math.max(0, Math.min(10, Math.trunc(lim)))
  return 0
}

function getRespondentBackUsedCount(meta: any): number {
  const obj = parseMeta(meta)
  const v = (obj as any)?.respondentBack?.used
  const n = Number(v)
  if (Number.isFinite(n))
    return Math.max(0, Math.trunc(n))
  return 0
}

function setRespondentBackUsed(prev: any, used: number) {
  const base = parseMeta(prev)
  return { ...base, respondentBack: { used } }
}

function parseMeta(meta: any): any {
  if (!meta)
    return {}
  if (typeof meta === 'string') {
    try {
      const obj = JSON.parse(meta)
      return obj && typeof obj === 'object' ? obj : {}
    }
    catch {
      return {}
    }
  }
  return (meta && typeof meta === 'object') ? meta : {}
}

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

  const provider = (form as any).aiConfigJson?.provider as Provider | undefined
  const modelId = (form as any).aiConfigJson?.modelId as string | undefined
  const prompt = (form as any).aiConfigJson?.prompt as string | undefined

  const stopping = getStopping((form as any).settingsJson)

  if (!provider || !modelId || !prompt)
    throw new Error('AI not configured for this form')

  await assertProviderAllowedForUser(provider, form.ownerUserId)

  const result = await generateInterviewFollowUp({
    provider,
    modelId,
    apiKeyEnc: (form as any).aiProviderKeyEnc,
    formGoalPrompt: prompt,
    planSummary: (form as any).settingsJson?.summary ?? undefined,
    stopping,
    indexValue,
    priorCount: priorTurns.length,
    history: history.map((h: any) => ({
      index: h.index,
      question: h.question ? { label: (h.question as any).label, type: (h.question as any).type } : undefined,
      answer: h.answer,
    })),
  })

  if (result.kind === 'end')
    return { kind: 'end', reason: result.reason, modelId: result.modelId }

  const incoming = result.question
  const incomingId = (incoming && typeof incoming.id === 'string' && incoming.id.trim().length > 0) ? String(incoming.id).trim() : undefined
  const question = {
    ...incoming,
    id: incomingId ?? uuidV7Base58(),
  }
  const [created] = await tx.insert(Turns).values({
    conversationId,
    index: indexValue,
    questionJson: question as any,
    status: 'awaiting_answer',
  }).returning()
  return { kind: 'turn', turn: created }
}

// Owner admin queries
const listFormConversationsSchema = z.object({
  formId: idSchema,
  status: z.enum(['active', 'completed']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const listFormConversations = query(async (raw: { formId: string, status?: 'active' | 'completed', page?: number, pageSize?: number }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(listFormConversationsSchema, raw, 'conv:listByForm')

  // Ownership check
  const [form] = await db.select().from(Forms).where(eq(Forms.id, input.formId))
  if (!form)
    throw new Error('Form not found')
  if ((form as any).ownerUserId !== userId)
    throw new Error('Forbidden')

  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25))
  const offset = (page - 1) * pageSize

  const whereConds: any[] = [eq(Conversations.formId, input.formId)]
  if (input.status)
    whereConds.push(eq(Conversations.status, input.status))

  const items = await db
    .select({
      id: Conversations.id,
      status: Conversations.status,
      startedAt: Conversations.startedAt,
      completedAt: Conversations.completedAt,
      clientMetaJson: Conversations.clientMetaJson,
    })
    .from(Conversations)
    .where(and(...whereConds))
    .orderBy(desc(Conversations.startedAt))
    .limit(pageSize)
    .offset(offset)

  const convIds = items.map(i => i.id)
  let countsMap = new Map<string, number>()
  if (convIds.length > 0) {
    const counts = await db
      .select({ conversationId: Turns.conversationId, c: sql<number>`count(*)`.as('c') })
      .from(Turns)
      .where(inArray(Turns.conversationId, convIds))
      .groupBy(Turns.conversationId)
    countsMap = new Map(counts.map(r => [r.conversationId, Number((r as any).c ?? 0)]))
  }

  const parsed = items.map((i: any) => ({
    id: i.id,
    status: i.status,
    startedAt: i.startedAt,
    completedAt: i.completedAt,
    steps: countsMap.get(i.id) ?? 0,
    endReason: (() => {
      const m = parseMeta(i.clientMetaJson)
      const r = (m as any)?.end?.reason
      return (r === 'hard_limit' || r === 'enough_info' || r === 'trolling') ? r : null
    })(),
    provider: (form as any)?.aiConfigJson?.provider ?? null,
    modelId: (form as any)?.aiConfigJson?.modelId ?? null,
  }))

  return { items: parsed, page, pageSize }
}, 'conv:listByForm')

export const getConversationTranscript = query(async (raw: { conversationId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const { conversationId } = safeParseOrThrow(z.object({ conversationId: idSchema }), raw, 'conv:getTranscript')

  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  const [form] = await db.select().from(Forms).where(eq(Forms.id, (conv as any).formId))
  if (!form)
    throw new Error('Form not found')
  if ((form as any).ownerUserId !== userId)
    throw new Error('Forbidden')

  const turns = await db
    .select()
    .from(Turns)
    .where(eq(Turns.conversationId, conversationId))
    .orderBy(asc(Turns.index))

  return {
    conversation: {
      id: (conv as any).id,
      formId: (conv as any).formId,
      status: (conv as any).status,
      startedAt: (conv as any).startedAt,
      completedAt: (conv as any).completedAt,
      endReason: (() => {
        const m = parseMeta((conv as any).clientMetaJson)
        const r = (m as any)?.end?.reason
        return (r === 'hard_limit' || r === 'enough_info' || r === 'trolling') ? r : null
      })(),
    },
    turns,
  }
}, 'conv:transcript')
