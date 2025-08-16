import { action, query } from '@solidjs/router'
import { and, asc, eq } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { ensure } from '~/utils'
import { db } from './db'
import { Conversations, Forms, Messages } from './db/schema'

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
  if (existing.length > 0)
    return existing[0]

  const [created] = await db.insert(Conversations).values({
    formId,
    respondentUserId: userId,
    status: 'active',
  }).returning()

  return created
}, 'conv:getOrCreate')

const listMessagesSchema = z.object({ conversationId: idSchema })

export const listMessages = query(async (raw: { conversationId: string }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId } = safeParseOrThrow(listMessagesSchema, raw, 'conv:listMessages')

  // Ensure participant
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  if (conv.respondentUserId !== userId)
    throw new Error('Forbidden')

  const items = await db
    .select()
    .from(Messages)
    .where(eq(Messages.conversationId, conversationId))
    .orderBy(asc(Messages.createdAt))
  return { items }
}, 'conv:listMessages')

const sendMessageSchema = z.object({
  conversationId: idSchema,
  fieldId: z.string().min(1).max(48),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

export const sendMessage = action(async (raw: { conversationId: string, fieldId: string, value: string | number | boolean }) => {
  'use server'
  const userId = await requireUserId()
  const { conversationId, fieldId, value } = safeParseOrThrow(sendMessageSchema, raw, 'conv:send')

  // Ensure participant
  const [conv] = await db.select().from(Conversations).where(eq(Conversations.id, conversationId))
  if (!conv)
    throw new Error('Conversation not found')
  if (conv.respondentUserId !== userId)
    throw new Error('Forbidden')
  if (conv.status !== 'active')
    throw new Error('Conversation not active')

  // Persist user message
  const contentText = typeof value === 'string' ? value : JSON.stringify(value)
  await db.insert(Messages).values({
    conversationId,
    role: 'user',
    contentText,
    contentJson: { fieldId, value },
  })

  // Canned AI reply for milestone 2 (non-streaming). Upgrade to streaming in milestone 3.
  const aiText = 'Thanks, noted.'
  const [ai] = await db.insert(Messages).values({
    conversationId,
    role: 'ai',
    contentText: aiText,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
  }).returning()

  return { ai }
}, 'conv:send')

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
