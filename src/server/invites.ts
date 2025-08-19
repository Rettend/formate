import process from 'node:process'
import { action, query } from '@solidjs/router'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { setCookie } from 'vinxi/http'
import { z } from 'zod'
import { uuidV7Base58 } from '~/lib'
import { generateShortCode } from '~/lib/invites'
import { idSchema, safeParseOrThrow } from '~/lib/validation'
import { db } from './db'
import { Forms, Invites } from './db/schema'

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

  const codes: Array<{ jti: string, expSec: number, code: string }> = []
  for (let i = 0; i < count; i++) {
    // Create unique id and short code
    const jti = uuidV7Base58()

    // Generate unique short code; retry on rare collision
    let code = generateShortCode(8)
    for (let tries = 0; tries < 5; tries++) {
      const [existing] = await db.select().from(Invites).where(eq(Invites.shortCode, code))
      if (!existing)
        break
      code = generateShortCode(8)
    }

    await db.insert(Invites).values({
      jti,
      formId: input.formId,
      shortCode: code,
      expAt: new Date(Date.now() + ttlSec * 1000) as any,
      createdByUserId: userId as any,
    })

    codes.push({ jti, expSec: ttlSec, code })
  }
  return { codes }
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
    .select({ formId: Invites.formId, jti: Invites.jti, usedAt: Invites.usedAt, usedByUserId: Invites.usedByUserId })
    .from(Invites)
    .where(inArray(Invites.formId, formIds))
    .orderBy(desc(Invites.usedAt))

  const byForm: Record<string, { used: Array<{ jti: string, usedAt: Date, usedByUserId?: string | null }> }> = {}
  for (const r of rows) {
    if (!r.usedAt)
      continue
    if (!byForm[r.formId])
      byForm[r.formId] = { used: [] }
    byForm[r.formId].used.push({ jti: r.jti, usedAt: (r as any).usedAt, usedByUserId: (r as any).usedByUserId ?? null })
  }

  return { forms: owned, byForm }
}, 'invites:listUsed')

const redeemSchema = z.object({ code: z.string().min(6).max(24) })

export const redeemInvite = action(async (raw: { code: string }) => {
  'use server'
  const event = getRequestEvent()
  const input = safeParseOrThrow(redeemSchema, raw, 'invites:redeem')

  // Lookup by short code
  const [inv] = await db.select().from(Invites).where(eq(Invites.shortCode, input.code))
  if (!inv)
    throw new Error('Invalid invite')
  const formId = (inv as any).formId as string
  const jti = (inv as any).jti as string
  if ((inv as any).usedAt)
    throw new Error('Invite already used')
  const exp = ((inv as any).expAt as Date | undefined) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000)

  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId!))
  if (!form)
    throw new Error('Form not found')

  const session = await event?.locals.getSession()
  const usedByUserId = session?.user?.id ?? null

  // Record usage in Invites row when present; if token path lacks a pre-persisted row, skip update gracefully
  await db
    .update(Invites)
    .set({ usedAt: new Date(), usedByUserId: usedByUserId as any })
    .where(eq(Invites.jti, jti!))

  // Set cookie for this form so subsequent actions can identify the invite respondent
  const cookieName = `form_invite_${formId}`
  const cookieValue = jti!
  setCookie(cookieName, cookieValue, {
    path: '/', // make available to action endpoints
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: exp!,
  } as any)
  return { ok: true, formId, jti, exp: exp!.toISOString() }
}, 'invites:redeem')

// Resolve short code to formId without redeeming (useful for canonical redirects after an error)
export const resolveInviteCode = query(async (raw: { code: string }) => {
  'use server'
  const { code } = safeParseOrThrow(z.object({ code: z.string().min(6).max(24) }), raw, 'invites:resolve')
  const [inv] = await db.select().from(Invites).where(eq(Invites.shortCode, code))
  if (!inv)
    throw new Error('Not found')
  const formId = (inv as any).formId as string
  const [form] = await db.select({ slug: Forms.slug }).from(Forms).where(eq(Forms.id, formId))
  return { formId, slug: (form as any)?.slug as string | undefined }
}, 'invites:resolve')
