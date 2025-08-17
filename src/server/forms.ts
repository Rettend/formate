import { action, query } from '@solidjs/router'
import { and, desc, eq, like } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'
import { idSchema, paginationSchema, safeParseOrThrow } from '~/lib/validation'
import { formPlanSchema, testRunTranscriptSchema } from '~/lib/validation/form-plan'
import { db } from './db'
import { Forms, FormTestRuns } from './db/schema'

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
  slug?: string
}

const listFormsSchema = z.object({
  page: paginationSchema.shape.page.optional(),
  pageSize: paginationSchema.shape.pageSize.optional(),
  q: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export const listForms = query(async (raw: ListFormsInput = {}) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(listFormsSchema, raw, 'forms:list')

  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const conditions = [eq(Forms.ownerUserId, session.user.id)] as any[]
  if (input.status)
    conditions.push(eq(Forms.status, input.status))
  if (input.q && input.q.length > 0)
    conditions.push(like(Forms.title, `%${input.q}%`))

  const items = await db
    .select({ id: Forms.id, title: Forms.title, status: Forms.status, updatedAt: Forms.updatedAt, slug: Forms.slug })
    .from(Forms)
    .where(and(...conditions))
    .orderBy(desc(Forms.updatedAt))
    .limit(pageSize)
    .offset(offset)

  return { items, page, pageSize }
}, 'forms:list')

const getFormSchema = z.object({ formId: idSchema })

export const getForm = query(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(getFormSchema, raw, 'forms:get')

  const rows = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  const form = rows[0]
  return form ?? null
}, 'forms:get')

const createFormSchema = z.object({
  title: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
  slug: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
})

export const createForm = action(async (raw: { title?: string, slug?: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(createFormSchema, raw, 'forms:create')
  const slugSanitized = input.slug
    ? input.slug
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
    : undefined

  const [created] = await db.insert(Forms).values({
    ownerUserId: session.user.id,
    title: input.title?.trim() || 'Untitled Form',
    slug: slugSanitized,
  }).returning()

  return created
}, 'forms:create')

const updateFormSchema = z.object({
  formId: idSchema,
  patch: z.object({
    title: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
  }),
})

export const updateForm = action(async (raw: { formId: string, patch: { title?: string } }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const { formId, patch } = safeParseOrThrow(updateFormSchema, raw, 'forms:update')
  const updates: Partial<typeof Forms.$inferInsert> = {}
  if (typeof patch.title === 'string')
    updates.title = patch.title.trim()
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

const formIdOnlySchema = z.object({ formId: idSchema })

export const publishForm = action(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(formIdOnlySchema, raw, 'forms:publish')

  const [updated] = await db
    .update(Forms)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
    .returning({ id: Forms.id, status: Forms.status })

  if (!updated)
    throw new Error('Not found')
  return updated
}, 'forms:publish')

export const unpublishForm = action(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(formIdOnlySchema, raw, 'forms:unpublish')

  const [updated] = await db
    .update(Forms)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
    .returning({ id: Forms.id, status: Forms.status })

  if (!updated)
    throw new Error('Not found')
  return updated
}, 'forms:unpublish')

const getPublicBySlugSchema = z.object({ slug: z.string().min(1).max(100) })

export const getPublicFormBySlug = query(async (raw: { slug: string }) => {
  'use server'
  const { slug } = safeParseOrThrow(getPublicBySlugSchema, raw, 'forms:getPublicBySlug')
  // First try by slug (preferred)
  let rows = await db
    .select({ id: Forms.id, title: Forms.title, status: Forms.status, settingsJson: Forms.settingsJson, ownerUserId: Forms.ownerUserId })
    .from(Forms)
    .where(and(eq(Forms.slug, slug), eq(Forms.status, 'published')))
  let form = rows[0]
  // Fallback: if the provided slug looks like an id, try by id — allows /r/:id during transition
  if (!form && /^[\w-]{16,24}$/u.test(slug)) {
    rows = await db
      .select({ id: Forms.id, title: Forms.title, status: Forms.status, settingsJson: Forms.settingsJson, ownerUserId: Forms.ownerUserId })
      .from(Forms)
      .where(and(eq(Forms.id, slug), eq(Forms.status, 'published')))
    form = rows[0]
  }
  return form ?? null
}, 'forms:getPublicBySlug')

export const deleteForm = action(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(formIdOnlySchema, raw, 'forms:delete')

  const deleted = await db
    .delete(Forms)
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))

  return { ok: deleted.rowsAffected > 0 }
}, 'forms:delete')

const savePromptSchema = z.object({
  formId: idSchema,
  prompt: z.string().min(1).max(4000),
  provider: z.string(),
  modelId: z.string(),
})

export const saveFormPrompt = action(async (raw: { formId: string, prompt: string, provider: string, modelId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(savePromptSchema, raw, 'forms:savePrompt')

  const [updated] = await db
    .update(Forms)
    .set({ aiConfigJson: { prompt: input.prompt, provider: input.provider, modelId: input.modelId }, updatedAt: new Date() })
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
    .returning()
  if (!updated)
    throw new Error('Not found')
  return { ok: true }
}, 'forms:savePrompt')

const planWithAISchema = z.object({
  formId: idSchema,
  prompt: z.string().min(1).max(4000),
  provider: z.string(),
  modelId: z.string(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  apiKey: z.string().optional(),
})

export const planWithAI = action(async (raw: { formId: string, prompt: string, provider: string, modelId: string, temperature?: number, apiKey?: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(planWithAISchema, raw, 'forms:planWithAI')

  // Ensure ownership
  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')

  const { planFormWithLLM } = await import('~/lib/ai/form-planner')
  const { plan } = await planFormWithLLM({ prompt: input.prompt, provider: input.provider, modelId: input.modelId, temperature: input.temperature, apiKey: input.apiKey })
  const safePlan = formPlanSchema.parse(plan)

  await db
    .update(Forms)
    .set({ aiConfigJson: { prompt: input.prompt, provider: input.provider, modelId: input.modelId }, settingsJson: safePlan, seedQuestionJson: safePlan.seed, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
  return { plan: safePlan }
}, 'forms:planWithAI')

const testRunSchema = z.object({
  formId: idSchema,
  maxSteps: z.coerce.number().int().min(1).max(20).optional(),
  provider: z.string(),
  modelId: z.string(),
  apiKey: z.string().optional(),
})

export const createTestRun = action(async (raw: { formId: string, maxSteps?: number, provider: string, modelId: string, apiKey?: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(testRunSchema, raw, 'forms:testRun')

  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')
  if (!form.settingsJson)
    throw new Error('No plan applied yet')

  const plan = formPlanSchema.parse(form.settingsJson)
  const { simulateTestRun } = await import('~/lib/ai/form-planner')
  const { transcript } = await simulateTestRun({ plan, provider: input.provider, modelId: input.modelId, maxSteps: input.maxSteps, apiKey: input.apiKey })
  const safeTranscript = testRunTranscriptSchema.parse(transcript)

  const [created] = await db.insert(FormTestRuns).values({
    formId: input.formId,
    createdByUserId: session.user.id,
    prompt: form.aiConfigJson?.prompt ?? '',
    provider: input.provider,
    modelId: input.modelId,
    transcriptJson: safeTranscript,
  }).returning()

  return { run: created }
}, 'forms:testRun')

const testStepSchema = z.object({
  formId: idSchema,
  index: z.coerce.number().int().min(0).max(100),
  provider: z.string(),
  modelId: z.string(),
  apiKey: z.string().optional(),
})

export const runTestStep = action(async (raw: { formId: string, index: number, provider: string, modelId: string, apiKey?: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(testStepSchema, raw, 'forms:testStep')

  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')
  if (!form.settingsJson)
    throw new Error('No plan applied yet')

  const plan = formPlanSchema.parse(form.settingsJson)
  if (input.index !== 0)
    throw new Error('Index out of range')

  const { simulateTestStep } = await import('~/lib/ai/form-planner')
  const step = await simulateTestStep({ plan, index: input.index, provider: input.provider, modelId: input.modelId, apiKey: input.apiKey })
  return { step, total: 1 }
}, 'forms:testStep')
