import type { Provider } from '~/lib/ai/lists'
import { action, query } from '@solidjs/router'
import { and, desc, eq, like } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'
import { aiErrorToMessage, logAIError } from '~/lib/ai/errors'
import { idSchema, paginationSchema, safeParseOrThrow } from '~/lib/validation'
import { formPlanSchema, testRunTranscriptSchema } from '~/lib/validation/form-plan'
import { assertProviderAllowedForUser } from './ai'
import { encryptSecret } from './crypto'
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
  if (!form)
    return null
  // Never send the encrypted provider key to the client; only indicate presence
  const hasProviderKey = Boolean((form as any).aiProviderKeyEnc)
  const { aiProviderKeyEnc: _omit, ...rest } = form as any
  return { ...rest, hasProviderKey } as any
}, 'forms:get')

const createFormSchema = z.object({
  title: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
  slug: z.string().optional().transform(v => (typeof v === 'string' ? v.trim() : undefined)),
})
const saveFormSchema = z.object({
  formId: idSchema,
  slug: z.string().max(100).transform(v => v.trim()),
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

  const slugToSave = slugSanitized === '' ? null : slugSanitized

  const [created] = await db.insert(Forms).values({
    ownerUserId: session.user.id,
    title: input.title?.trim() || 'Untitled Form',
    slug: slugToSave,
  }).returning()

  return created
}, 'forms:create')

export const saveFormSlug = action(async (raw: { formId: string, slug: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(saveFormSchema, raw, 'forms:saveSlug')
  const slugSanitized = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)

  const slugToSave = slugSanitized === '' ? null : slugSanitized

  const [updated] = await db
    .update(Forms)
    .set({ slug: slugToSave, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
    .returning()

  if (!updated)
    throw new Error('Not found')
  return updated
}, 'forms:saveSlug')
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
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const viewerId = session?.user?.id

  const { slug } = safeParseOrThrow(getPublicBySlugSchema, raw, 'forms:getPublicBySlug')

  const canView = (row: { status: string, ownerUserId: string }) =>
    row.status === 'published' || (viewerId && row.ownerUserId === viewerId)

  // First try by slug (preferred) — fetch without status filter, gate in app
  let rows = await db
    .select({
      id: Forms.id,
      title: Forms.title,
      status: Forms.status,
      settingsJson: Forms.settingsJson,
      ownerUserId: Forms.ownerUserId,
      slug: Forms.slug,
      aiConfigJson: Forms.aiConfigJson,
      aiProviderKeyEnc: Forms.aiProviderKeyEnc,
    })
    .from(Forms)
    .where(eq(Forms.slug, slug))
  let form = rows.find(canView)

  // Fallback: if the provided slug looks like an id, try by id — allows /r/:id during transition
  if (!form && /^[\w-]{16,24}$/u.test(slug)) {
    rows = await db
      .select({ id: Forms.id, title: Forms.title, status: Forms.status, settingsJson: Forms.settingsJson, ownerUserId: Forms.ownerUserId, slug: Forms.slug, aiConfigJson: Forms.aiConfigJson, aiProviderKeyEnc: Forms.aiProviderKeyEnc })
      .from(Forms)
      .where(eq(Forms.id, slug))
    form = rows.find(canView)
  }

  if (!form)
    return null

  const aiCfg: any = (form as any).aiConfigJson
  const hasAIConfig = Boolean(aiCfg?.provider && aiCfg?.modelId && typeof aiCfg?.prompt === 'string' && aiCfg?.prompt.trim().length > 0)
  const providerId: string | undefined = aiCfg?.provider
  const needsPerFormKey = providerId && providerId !== 'formate'
  const hasProviderKey = Boolean((form as any).aiProviderKeyEnc)
  const keyOk = needsPerFormKey ? hasProviderKey : true

  const aiReady = hasAIConfig && keyOk
  const aiReason: 'ok' | 'missing_config' | 'missing_key' = aiReady
    ? 'ok'
    : (!hasAIConfig ? 'missing_config' : 'missing_key')

  const { aiProviderKeyEnc: _omit, ...rest } = form as any
  return { ...rest, aiReady, aiReason, hasAIConfig }
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

  await assertProviderAllowedForUser(input.provider, session.user.id)

  const [updated] = await db
    .update(Forms)
    .set({ aiConfigJson: { prompt: input.prompt, provider: input.provider, modelId: input.modelId }, updatedAt: new Date() })
    .where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
    .returning()
  if (!updated)
    throw new Error('Not found')
  return { ok: true }
}, 'forms:savePrompt')

const saveProviderKeySchema = z.object({ formId: idSchema, apiKey: z.string().min(1) })
const clearProviderKeySchema = z.object({ formId: idSchema })

export const saveFormProviderKey = action(async (raw: { formId: string, apiKey: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(saveProviderKeySchema, raw, 'forms:saveProviderKey')

  // ensure ownership
  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')

  const provider: string | undefined = (form as any)?.aiConfigJson?.provider
  if (provider === 'formate')
    throw new Error('Formate provider uses a server-managed key. No per-form key is needed.')

  const enc = await encryptSecret(input.apiKey)
  const [updated] = await db
    .update(Forms)
    .set({ aiProviderKeyEnc: enc, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
    .returning({ id: Forms.id })
  return { ok: Boolean(updated) }
}, 'forms:saveProviderKey')

export const clearFormProviderKey = action(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(clearProviderKeySchema, raw, 'forms:clearProviderKey')

  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')

  const [updated] = await db
    .update(Forms)
    .set({ aiProviderKeyEnc: null as any, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
    .returning({ id: Forms.id })
  return { ok: Boolean(updated) }
}, 'forms:clearProviderKey')

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

  await assertProviderAllowedForUser(input.provider, session.user.id)

  const { planFormWithLLM } = await import('~/lib/ai/form-planner')
  let plan: unknown
  try {
    const res = await planFormWithLLM({ prompt: input.prompt, provider: input.provider as Provider, modelId: input.modelId, temperature: input.temperature, apiKey: input.apiKey })
    plan = res.plan
  }
  catch (err) {
    logAIError(err, 'planWithAI')
    throw new Error(aiErrorToMessage(err))
  }
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

  await assertProviderAllowedForUser(input.provider, session.user.id)

  const plan = formPlanSchema.parse(form.settingsJson)
  const { simulateTestRun } = await import('~/lib/ai/form-planner')
  let transcript: unknown
  try {
    const res = await simulateTestRun({ plan, provider: input.provider as Provider, modelId: input.modelId, maxSteps: input.maxSteps, apiKey: input.apiKey })
    transcript = res.transcript
  }
  catch (err) {
    logAIError(err, 'testRun')
    throw new Error(aiErrorToMessage(err))
  }
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

  await assertProviderAllowedForUser(input.provider, session.user.id)

  const plan = formPlanSchema.parse(form.settingsJson)
  if (input.index !== 0)
    throw new Error('Index out of range')

  const { simulateTestStep } = await import('~/lib/ai/form-planner')
  let step
  try {
    step = await simulateTestStep({ plan, index: input.index, provider: input.provider as Provider, modelId: input.modelId, apiKey: input.apiKey })
  }
  catch (err) {
    logAIError(err, 'testStep')
    throw new Error(aiErrorToMessage(err))
  }
  return { step, total: 1 }
}, 'forms:testStep')

const stoppingSchema = z.object({
  hardLimit: z.object({ maxQuestions: z.coerce.number().int().min(1).max(50) }),
  llmMayEnd: z.boolean(),
  endReasons: z.array(z.enum(['enough_info', 'trolling'])).min(0).max(2),
})

export const saveFormStopping = action(async (raw: { formId: string, stopping: z.infer<typeof stoppingSchema> }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(z.object({ formId: idSchema, stopping: stoppingSchema }), raw, 'forms:saveStopping')

  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')

  const existing = (form as any).settingsJson ?? {}
  const next = { ...existing, stopping: input.stopping }

  const [updated] = await db
    .update(Forms)
    .set({ settingsJson: next as any, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
    .returning()
  if (!updated)
    throw new Error('Update failed')
  return { ok: true }
}, 'forms:saveStopping')

const accessSchema = z.object({
  allowOAuth: z.boolean().optional(),
  respondentBackLimit: z.coerce.number().int().min(0).max(10).optional(),
})

export const saveFormAccess = action(async (raw: { formId: string, access: z.infer<typeof accessSchema> }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')

  const input = safeParseOrThrow(z.object({ formId: idSchema, access: accessSchema }), raw, 'forms:saveAccess')

  const [form] = await db.select().from(Forms).where(and(eq(Forms.id, input.formId), eq(Forms.ownerUserId, session.user.id)))
  if (!form)
    throw new Error('Not found')

  const existing = (form as any).settingsJson ?? {}
  const prevAccess = (existing as any).access || {}
  const nextAccess = { ...prevAccess }
  if (typeof input.access.allowOAuth === 'boolean')
    (nextAccess as any).allowOAuth = input.access.allowOAuth
  if (typeof input.access.respondentBackLimit === 'number')
    (nextAccess as any).respondentBackLimit = input.access.respondentBackLimit
  const next = { ...existing, access: nextAccess }

  const [updated] = await db
    .update(Forms)
    .set({ settingsJson: next as any, updatedAt: new Date() })
    .where(eq(Forms.id, input.formId))
    .returning({ id: Forms.id })
  return { ok: Boolean(updated) }
}, 'forms:saveAccess')
