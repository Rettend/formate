import { action, query } from '@solidjs/router'
import { and, desc, eq, like } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { db } from './db'
import { Forms } from './db/schema'

export interface ListFormsInput {
  page?: number
  pageSize?: number
  q?: string
  status?: 'draft' | 'published' | 'archived'
}

export interface ListFormsOutputItem {
  id: string
  title: string
  status: string
  updatedAt: Date
}

export const listForms = query(async (input: ListFormsInput = {}) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const conditions = [eq(Forms.ownerUserId, session.user.id)] as any[]
  if (input.status)
    conditions.push(eq(Forms.status, input.status))
  if (input.q && input.q.trim().length > 0)
    conditions.push(like(Forms.title, `%${input.q.trim()}%`))

  const items = await db
    .select({ id: Forms.id, title: Forms.title, status: Forms.status, updatedAt: Forms.updatedAt })
    .from(Forms)
    .where(and(...conditions))
    .orderBy(desc(Forms.updatedAt))
    .limit(pageSize)
    .offset(offset)

  return { items, page, pageSize }
}, 'forms:list')

export const getForm = query(async (input: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const rows = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  const form = rows[0]
  return form ?? null
}, 'forms:get')

export const createForm = action(async (input: { title?: string, description?: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const [created] = await db.insert(Forms).values({
    ownerUserId: session.user.id,
    title: input.title?.trim() || 'Untitled Form',
    description: input.description?.trim(),
  }).returning()

  return created
}, 'forms:create')

export const updateForm = action(async (input: { formId: string, patch: { title?: string, description?: string } }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const { formId, patch } = input
  const updates: Partial<typeof Forms.$inferInsert> = {}
  if (typeof patch.title === 'string')
    updates.title = patch.title.trim()
  if (typeof patch.description === 'string')
    updates.description = patch.description.trim()
  updates.updatedAt = new Date()

  const [updated] = await db
    .update(Forms)
    .set(updates)
    .where(and(eq(Forms.id, formId), eq(Forms.ownerUserId, session.user.id)))
    .returning()

  if (!updated)
    throw new Error('Not found')
  return updated
}, 'forms:update')

export const publishForm = action(async (input: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const [updated] = await db
    .update(Forms)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
    .returning({ id: Forms.id, status: Forms.status })

  if (!updated)
    throw new Error('Not found')
  return updated
}, 'forms:publish')

export const deleteForm = action(async (input: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const deleted = await db
    .delete(Forms)
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))

  return { ok: deleted.rowsAffected > 0 }
}, 'forms:delete')
