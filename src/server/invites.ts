import process from 'node:process'
import { action, query } from '@solidjs/router'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { setCookie } from 'vinxi/http'
import { z } from 'zod'
import { uuidV7Base58 } from '~/lib'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { auth } from './auth'
import { db } from './db'
import { Forms, UsedInviteTokens } from './db/schema'

const PURPOSE = 'respondent-invite'

function ensureOwner(form: { ownerUserId: string }, userId?: string) {
  if (!userId || form.ownerUserId !== userId)
    throw new Error('Forbidden')
}

export const createInviteTokens = action(async (raw: { formId: string, count?: number, ttlMinutes?: number }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id

  const input = safeParseOrThrow(z.object({
    formId: idSchema,
    count: z.coerce.number().int().min(1).max(100).default(1).optional(),
    ttlMinutes: z.coerce.number().int().min(5).max(60 * 24 * 30).default(60 * 24 * 7).optional(),
  }), raw, 'invites:create')

  const [form] = await db.select().from(Forms).where(eq(Forms.id, input.formId))
  if (!form)
    throw new Error('Form not found')
  ensureOwner(form, userId)

  const ttlSec = (input.ttlMinutes ?? 60 * 24 * 7) * 60

  const count = Math.max(1, Math.min(100, input.count ?? 1))
  const tokens: Array<{ token: string, jti: string, expSec: number }> = []
  for (let i = 0; i < count; i++) {
    const jti = uuidV7Base58()
    const token = await auth.signJWT({ purpose: PURPOSE, sub: input.formId, jti }, { ttl: ttlSec })
    tokens.push({ token, jti, expSec: ttlSec })
  }
  return { tokens }
}, 'invites:create')

export const listUsedInviteTokens = query(async (raw: { formIds?: string[] } = {}) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Error('Unauthorized')

  const owned = await db
    .select({ id: Forms.id, title: Forms.title, slug: Forms.slug })
    .from(Forms)
    .where(eq(Forms.ownerUserId, userId))
    .orderBy(asc(Forms.title))

  const formIds = (raw?.formIds && raw.formIds.length > 0) ? raw.formIds : owned.map(f => f.id)
  if (formIds.length === 0)
    return { forms: [], byForm: {} as Record<string, { used: Array<{ jti: string, usedAt: Date, usedByUserId?: string | null }> }> }

  const rows = await db
    .select()
    .from(UsedInviteTokens)
    .where(inArray(UsedInviteTokens.formId, formIds))
    .orderBy(desc(UsedInviteTokens.usedAt))

  const byForm: Record<string, { used: Array<{ jti: string, usedAt: Date, usedByUserId?: string | null }> }> = {}
  for (const r of rows) {
    if (!byForm[r.formId])
      byForm[r.formId] = { used: [] }
    byForm[r.formId].used.push({ jti: r.jti, usedAt: (r as any).usedAt, usedByUserId: (r as any).usedByUserId ?? null })
  }

  return { forms: owned, byForm }
}, 'invites:listUsed')

const redeemSchema = z.object({ token: z.string().min(10) })

export const redeemInvite = action(async (raw: { token: string }) => {
  'use server'
  const event = getRequestEvent()
  const input = safeParseOrThrow(redeemSchema, raw, 'invites:redeem')

  const payload = await auth.verifyJWT<{ purpose?: string, sub?: string, jti?: string, exp?: number }>(input.token)
  if (!payload || payload.purpose !== PURPOSE || !payload.sub || !payload.jti)
    throw new Error('Invalid invite')

  const formId = payload.sub
  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Error('Form not found')

  const existing = await db.select().from(UsedInviteTokens).where(eq(UsedInviteTokens.jti, payload.jti))
  if (existing.length > 0)
    throw new Error('Invite already used')

  const session = await event?.locals.getSession()
  const usedByUserId = session?.user?.id ?? null

  await db.insert(UsedInviteTokens).values({ jti: payload.jti, formId, usedByUserId: usedByUserId as any })

  const exp = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000)
  // Set cookie for this form so subsequent actions can identify the invite respondent
  const cookieName = `form_invite_${formId}`
  const cookieValue = payload.jti
  setCookie(cookieName, cookieValue, {
    path: '/', // make available to action endpoints
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: exp,
  } as any)
  return { ok: true, formId, jti: payload.jti, exp: exp.toISOString() }
}, 'invites:redeem')
