import { action, query } from '@solidjs/router'
import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { z } from 'zod'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { assertProviderAllowedForUser } from './ai'
import { db } from './db'
import { Conversations, Forms, Invites, Summaries, Turns, Users } from './db/schema'

const rangeSchema = z.enum(['7d', '30d', '90d'])

function rangeToDates(range: '7d' | '30d' | '90d') {
  const now = new Date()
  const start = new Date(now)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  start.setDate(now.getDate() - days)
  return { start, end: now }
}

export const generateFormSummary = action(async (raw: { formId: string, range: '7d' | '30d' | '90d' }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const input = safeParseOrThrow(z.object({ formId: idSchema, range: rangeSchema }), raw, 'analytics:generateFormSummary')

  const [form] = await db.select().from(Forms).where(eq(Forms.id, input.formId))
  if (!form)
    throw new Error('Form not found')
  if (form.ownerUserId !== session.user.id)
    throw new Error('Forbidden')

  const provider = form.aiConfigJson?.provider
  const modelId = form.aiConfigJson?.modelId
  const prompt = form.aiConfigJson?.prompt
  if (!provider || !modelId || !prompt)
    throw new Error('AI not configured for this form')
  await assertProviderAllowedForUser(provider, session.user.id)

  const { start, end } = rangeToDates(input.range)
  const conversations = await db
    .select()
    .from(Conversations)
    .where(and(eq(Conversations.formId, input.formId), eq(Conversations.status, 'completed'), gte(Conversations.completedAt, start), lte(Conversations.completedAt, end)))
    .orderBy(desc(Conversations.completedAt))
    .limit(50)

  // Gather compact transcript overview
  const convIds = conversations.map(c => c.id)
  const history: Array<{ index: number, question?: { label: string }, answer?: unknown }[]> = []
  if (convIds.length > 0) {
    for (const cid of convIds) {
      const turns = await db
        .select()
        .from(Turns)
        .where(eq(Turns.conversationId, cid))
        .orderBy(asc(Turns.index))
      history.push(turns.map(t => ({ index: t.index, question: t.questionJson ? { label: t.questionJson.label } : undefined, answer: t.answerJson ? t.answerJson.value : undefined })))
    }
  }

  const { generateFormInsights } = await import('~/lib/ai/summary')
  const bullets = await generateFormInsights({
    provider,
    modelId,
    apiKeyEnc: form.aiProviderKeyEnc,
    formGoalPrompt: prompt,
    planSummary: form.settingsJson?.summary ?? undefined,
    transcriptSamples: history,
  })

  // Upsert form-level summary
  const existing = await db
    .select()
    .from(Summaries)
    .where(and(eq(Summaries.kind, 'form'), eq(Summaries.formId, input.formId)))
    .limit(1)
  if (existing.length > 0) {
    await db.update(Summaries).set({ bulletsJson: bullets, updatedAt: new Date() }).where(eq(Summaries.id, existing[0].id))
  }
  else {
    await db.insert(Summaries).values({
      kind: 'form',
      formId: input.formId,
      bulletsJson: bullets,
      provider: form.aiConfigJson?.provider ?? null,
      modelId: form.aiConfigJson?.modelId ?? null,
      createdByUserId: session.user.id,
    })
  }

  return { bullets }
}, 'analytics:generateFormSummary')

export const getFormSummary = query(async (raw: { formId: string }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user?.id)
    throw new Error('Unauthorized')
  const { formId } = safeParseOrThrow(z.object({ formId: idSchema }), raw, 'analytics:getFormSummary')

  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Error('Form not found')
  if (form.ownerUserId !== session.user.id)
    throw new Error('Forbidden')

  const [row] = await db.select().from(Summaries).where(and(eq(Summaries.kind, 'form'), eq(Summaries.formId, formId))).limit(1)
  return { bullets: row?.bulletsJson ?? [] }
}, 'analytics:getFormSummary')

const rangeSchemaTime = z.enum(['7d', '30d', '90d']).default('7d')

function rangeToSince(range: '7d' | '30d' | '90d') {
  const days = range === '90d' ? 90 : range === '30d' ? 30 : 7
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d
}

export const getDashboardStats = query(async (raw?: { formId?: string | null }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const formId = raw?.formId ?? null

  const formsCountRows = await db
    .select({ c: count() })
    .from(Forms)
    .where(eq(Forms.ownerUserId, userId))
  const totalForms = Number((formsCountRows[0])?.c ?? 0)

  const ownedFormIds = await db
    .select({ id: Forms.id })
    .from(Forms)
    .where(eq(Forms.ownerUserId, userId))
  const formIds = (formId ? ownedFormIds.filter(f => f.id === formId) : ownedFormIds).map(f => f.id)
  if (formIds.length === 0)
    return { totalForms, responses7d: 0, activeConversations: 0 }

  const activeRows = await db
    .select({ c: count() })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, formIds), eq(Conversations.status, 'active')))
  const activeConversations = Number((activeRows[0])?.c ?? 0)

  const since = rangeToSince('7d')
  const respRows = await db
    .select({ c: count() })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, formIds), eq(Conversations.status, 'completed'), gte(Conversations.completedAt, since)))
  const responses7d = Number(respRows[0]?.c ?? 0)

  return { totalForms, responses7d, activeConversations }
}, 'analytics:dashboardStats')

export const listRecentCompletions = query(async (raw?: { limit?: number, formId?: string | null, page?: number, pageSize?: number }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const paged = typeof raw?.page === 'number' || typeof raw?.pageSize === 'number'
  const limit = Math.max(1, Math.min(50, Number(raw?.limit ?? 10)))
  const page = Math.max(1, Number(raw?.page ?? 1))
  const pageSize = Math.max(1, Math.min(100, Number(raw?.pageSize ?? 25)))
  const formId = raw?.formId ?? null

  // Restrict to owner forms
  const owned = await db
    .select({ id: Forms.id, title: Forms.title, aiConfigJson: Forms.aiConfigJson })
    .from(Forms)
    .where(eq(Forms.ownerUserId, userId))
  const ownedIds = (formId ? owned.filter(f => f.id === formId) : owned).map(f => f.id)
  if (ownedIds.length === 0)
    return { items: [] }

  // Fetch recent completed conversations
  const rows = await db
    .select({
      id: Conversations.id,
      formId: Conversations.formId,
      status: Conversations.status,
      startedAt: Conversations.startedAt,
      completedAt: Conversations.completedAt,
      respondentUserId: Conversations.respondentUserId,
      inviteJti: Conversations.inviteJti,
    })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, ownedIds), eq(Conversations.status, 'completed')))
    .orderBy(desc(Conversations.completedAt))
    .limit(paged ? (pageSize + 1) : limit)
    .offset(paged ? ((page - 1) * pageSize) : undefined as unknown as number)

  if (rows.length === 0)
    return paged ? { items: [], page, pageSize, hasMore: false } : { items: [] }

  const convIds = rows.map(r => r.id)
  // Count turns per conversation
  const turnCountsRows = await db
    .select({ conversationId: Turns.conversationId, c: count() })
    .from(Turns)
    .where(inArray(Turns.conversationId, convIds))
    .groupBy(Turns.conversationId)
  const turnCounts = new Map<string, number>(turnCountsRows.map(r => [r.conversationId, Number(r.c ?? 0)]))

  // Fetch ancillary info
  const userIds = rows.map(r => r.respondentUserId).filter(Boolean) as string[]
  const jtis = rows.map(r => r.inviteJti).filter(Boolean) as string[]
  const users = userIds.length > 0 ? await db.select().from(Users).where(inArray(Users.id, userIds)) : []
  const invites = jtis.length > 0 ? await db.select().from(Invites).where(inArray(Invites.jti, jtis)) : []
  const formById = new Map(owned.map(f => [f.id, f]))
  const userById = new Map(users.map(u => [u.id, u]))
  const inviteByJti = new Map(invites.map(i => [i.jti, i]))

  const trimmed = paged ? rows.slice(0, pageSize) : rows

  const items = trimmed.map(r => ({
    conversationId: r.id,
    formId: r.formId,
    formTitle: formById.get(r.formId)?.title ?? 'Form',
    provider: (() => {
      const f = formById.get(r.formId)
      return f?.aiConfigJson?.provider ?? null
    })(),
    modelId: (() => {
      const f = formById.get(r.formId)
      return f?.aiConfigJson?.modelId ?? null
    })(),
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    steps: turnCounts.get(r.id) ?? 0,
    respondent: (() => {
      const u = r.respondentUserId ? userById.get(r.respondentUserId) : null
      if (u)
        return { type: 'user', name: u.name ?? null, email: u.email ?? null }
      const inv = r.inviteJti ? inviteByJti.get(r.inviteJti) : null
      return inv ? { type: 'invite', label: inv.label ?? null, code: inv.shortCode } : { type: 'unknown' }
    })(),
  }))

  if (!paged)
    return { items }

  const hasMore = rows.length > pageSize
  return { items, page, pageSize, hasMore }
}, 'analytics:recentCompletions')

export const getCompletionTimeSeries = query(async (raw?: { range?: '7d' | '30d' | '90d', formId?: string | null }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const range = rangeSchemaTime.parse(raw?.range ?? '7d')
  const since = rangeToSince(range)
  const formId = raw?.formId ?? null

  const owned = await db.select({ id: Forms.id }).from(Forms).where(eq(Forms.ownerUserId, userId))
  const ids = (formId ? owned.filter(f => f.id === formId) : owned).map(f => f.id)
  if (ids.length === 0)
    return { buckets: [] as Array<{ date: string, count: number }> }

  const rows = await db
    .select({ completedAt: Conversations.completedAt })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, ids), eq(Conversations.status, 'completed'), gte(Conversations.completedAt, since)))

  const counts = new Map<string, number>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < (range === '90d' ? 90 : range === '30d' ? 30 : 7); i++) {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    counts.set(d.toISOString().slice(0, 10), 0)
  }
  for (const r of rows) {
    const key = (r.completedAt as Date).toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const buckets = Array.from(counts.entries()).map(([date, count]) => ({ date, count }))
  return { buckets }
}, 'analytics:timeSeries')

export const getFunnelStats = query(async (raw?: { range?: '7d' | '30d' | '90d', formId?: string | null }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const range = rangeSchemaTime.parse(raw?.range ?? '7d')
  const since = rangeToSince(range)
  const formId = raw?.formId ?? null

  const owned = await db.select({ id: Forms.id }).from(Forms).where(eq(Forms.ownerUserId, userId))
  const ids = (formId ? owned.filter(f => f.id === formId) : owned).map(f => f.id)
  if (ids.length === 0)
    return { started: 0, completed: 0, completionRate: 0 }

  const startedRows = await db
    .select({ c: count() })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, ids), gte(Conversations.startedAt, since)))
  const completedRows = await db
    .select({ c: count() })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, ids), eq(Conversations.status, 'completed'), gte(Conversations.completedAt, since)))

  const started = Number(startedRows[0]?.c ?? 0)
  const completed = Number(completedRows[0]?.c ?? 0)
  const completionRate = started > 0 ? Math.round((completed / started) * 1000) / 10 : 0
  return { started, completed, completionRate }
}, 'analytics:funnel')

export const getFormBreakdown = query(async (raw?: { range?: '7d' | '30d' | '90d', formId?: string | null }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const range = rangeSchemaTime.parse(raw?.range ?? '7d')
  const since = rangeToSince(range)
  const formId = raw?.formId ?? null

  const owned = await db.select({ id: Forms.id, title: Forms.title }).from(Forms).where(eq(Forms.ownerUserId, userId))
  const forms = formId ? owned.filter(f => f.id === formId) : owned
  if (forms.length === 0)
    return { items: [] }

  const ids = forms.map(f => f.id)
  const convs = await db
    .select({ id: Conversations.id, formId: Conversations.formId, status: Conversations.status, startedAt: Conversations.startedAt, completedAt: Conversations.completedAt })
    .from(Conversations)
    .where(and(inArray(Conversations.formId, ids), gte(Conversations.startedAt, since)))

  const convIds = convs.map(c => c.id)
  const turnCountsRows = convIds.length > 0
    ? await db
        .select({ conversationId: Turns.conversationId, c: count() })
        .from(Turns)
        .where(inArray(Turns.conversationId, convIds))
        .groupBy(Turns.conversationId)
    : []
  const turnCounts = new Map<string, number>(turnCountsRows.map(r => [r.conversationId, Number(r.c ?? 0)]))

  const byForm: Record<string, { started: number, completed: number, totalSteps: number, lastCompletedAt?: Date }> = {}
  for (const f of forms)
    byForm[f.id] = { started: 0, completed: 0, totalSteps: 0, lastCompletedAt: undefined }
  for (const c of convs) {
    const bucket = byForm[c.formId]
    if (!bucket)
      continue
    bucket.started += 1
    if (c.status === 'completed') {
      bucket.completed += 1
      bucket.totalSteps += turnCounts.get(c.id) ?? 0
      const t = c.completedAt as Date | null
      if (t && (!bucket.lastCompletedAt || t > bucket.lastCompletedAt))
        bucket.lastCompletedAt = t
    }
  }
  const items = forms.map((f) => {
    const b = byForm[f.id]
    const avgSteps = b.completed > 0 ? Math.round((b.totalSteps / b.completed) * 10) / 10 : 0
    const completionRate = b.started > 0 ? Math.round((b.completed / b.started) * 1000) / 10 : 0
    return { formId: f.id, title: f.title, started: b.started, completed: b.completed, completionRate, avgSteps, lastCompletedAt: b.lastCompletedAt ?? null }
  }).sort((a, b) => b.completed - a.completed)
  return { items }
}, 'analytics:breakdown')
