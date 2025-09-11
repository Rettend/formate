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
  if (!userId)
    throw new Response('Unauthorized', { status: 401 })
  if (form.ownerUserId !== userId)
    throw new Response('Forbidden', { status: 403 })
}

interface InviteEntryInput { label?: string | null, ttlMinutes?: number }
interface InviteUnused { jti: string, code: string, label?: string | null, createdAt: Date, expAt?: Date | null }
interface InviteUsed { jti: string, code: string, label?: string | null, usedAt: Date, usedByUserId?: string | null }
interface InviteRevoked { jti: string, code: string, label?: string | null, revokedAt: Date }
type InvitesByForm = Record<string, { unused: InviteUnused[], used: InviteUsed[], revoked: InviteRevoked[] }>

export const createInviteTokens = action(async (raw: { formId: string, count?: number, ttlMinutes?: number, entries?: Array<InviteEntryInput> }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id

  const input = safeParseOrThrow(z.object({
    formId: idSchema,
    count: z.coerce.number().int().min(1).max(100).default(1).optional(),
    ttlMinutes: z.coerce.number().int().min(5).max(60 * 24 * 30).default(60 * 24 * 7).optional(),
    entries: z.array(z.object({
      label: z.string().max(128).optional().nullable(),
      ttlMinutes: z.coerce.number().int().min(5).max(60 * 24 * 30).optional(),
    })).min(1).max(10).optional(),
  }), raw, 'invites:create')

  const [form] = await db.select().from(Forms).where(eq(Forms.id, input.formId))
  if (!form)
    throw new Response('Form not found', { status: 404 })
  ensureOwner(form, userId)

  const ttlSec = (input.ttlMinutes ?? 60 * 24 * 7) * 60

  const entries = input.entries?.slice(0, 10) ?? Array.from({ length: Math.max(1, Math.min(100, input.count ?? 1)) }, () => ({ label: null as string | null, ttlMinutes: input.ttlMinutes }))

  const codes: Array<{ jti: string, expSec: number, code: string, label?: string | null }> = []
  for (let i = 0; i < entries.length; i++) {
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
      label: entries[i]?.label ?? null as any,
      expAt: new Date(Date.now() + ((entries[i]?.ttlMinutes ? entries[i]!.ttlMinutes! * 60 : ttlSec)) * 1000) as any,
      createdByUserId: userId as any,
    })

    codes.push({ jti, expSec: ttlSec, code, label: entries[i]?.label ?? null })
  }
  return { codes }
}, 'invites:create')

export const listUsedInviteTokens = query(async (raw: { formIds?: string[] } = {}) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Response('Unauthorized', { status: 401 })

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
    throw new Response('Invalid invite', { status: 400 })
  const formId = (inv as any).formId as string
  const jti = (inv as any).jti as string
  const revokedAt = (inv as any).revokedAt as Date | null
  if ((inv as any).usedAt)
    throw new Response('Invite already used', { status: 409 })
  if (revokedAt)
    throw new Response('Invite revoked', { status: 409 })
  const exp = ((inv as any).expAt as Date | undefined) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000)
  if (exp && exp.getTime() < Date.now())
    throw new Response('Invite expired', { status: 409 })

  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId!))
  if (!form)
    throw new Response('Form not found', { status: 404 })

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
    throw new Response('Not found', { status: 404 })
  const formId = (inv as any).formId as string
  const [form] = await db.select({ slug: Forms.slug }).from(Forms).where(eq(Forms.id, formId))
  return { formId, slug: (form as any)?.slug as string | undefined }
}, 'invites:resolve')

export const listInvitesByForm = query(async (raw?: { formId?: string | null }) => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Response('Unauthorized', { status: 401 })

  const input = (raw && typeof raw === 'object') ? raw : {}
  const singleFormId = (typeof input.formId === 'string' && input.formId.trim().length > 0) ? input.formId.trim() : null

  const owned = await db
    .select({ id: Forms.id, title: Forms.title, slug: Forms.slug })
    .from(Forms)
    .where(eq(Forms.ownerUserId, userId))
    .orderBy(asc(Forms.title))

  const formIds = singleFormId ? owned.filter(f => f.id === singleFormId).map(f => f.id) : owned.map(f => f.id)
  if (formIds.length === 0)
    return { forms: [], byForm: {} as InvitesByForm }

  const rows = await db
    .select({
      formId: Invites.formId,
      jti: Invites.jti,
      code: Invites.shortCode,
      label: Invites.label,
      createdAt: Invites.createdAt,
      expAt: Invites.expAt,
      usedAt: Invites.usedAt,
      usedByUserId: Invites.usedByUserId,
      revokedAt: Invites.revokedAt,
    })
    .from(Invites)
    .where(inArray(Invites.formId, formIds))
    .orderBy(desc(Invites.createdAt))

  const byForm: InvitesByForm = {}

  for (const r of rows as any[]) {
    const fid = r.formId as string
    if (!byForm[fid])
      byForm[fid] = { unused: [], used: [], revoked: [] }
    if (r.revokedAt) {
      byForm[fid].revoked.push({ jti: r.jti, code: r.code, label: r.label ?? null, revokedAt: r.revokedAt })
      continue
    }
    if (r.usedAt)
      byForm[fid].used.push({ jti: r.jti, code: r.code, label: r.label ?? null, usedAt: r.usedAt, usedByUserId: r.usedByUserId ?? null })

    else
      byForm[fid].unused.push({ jti: r.jti, code: r.code, label: r.label ?? null, createdAt: r.createdAt, expAt: r.expAt ?? null })
  }

  const formsOut = singleFormId ? owned.filter(f => f.id === singleFormId) : owned
  return { forms: formsOut, byForm }
}, 'invites:listAll')

export const revokeInvite = action(async (raw: { jti: string }) => {
  'use server'
  const { jti } = safeParseOrThrow(z.object({ jti: z.string().min(8) }), raw, 'invites:revoke')
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Response('Unauthorized', { status: 401 })

  const [inv] = await db.select().from(Invites).where(eq(Invites.jti, jti))
  if (!inv)
    throw new Response('Invite not found', { status: 404 })
  const formId = (inv as any).formId as string
  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Response('Form not found', { status: 404 })
  ensureOwner(form, userId)
  if ((inv as any).usedAt)
    throw new Response('Cannot revoke a used invite', { status: 409 })
  if ((inv as any).revokedAt)
    return { ok: true }

  await db.update(Invites).set({ revokedAt: new Date() as any }).where(eq(Invites.jti, jti))
  return { ok: true }
}, 'invites:revoke')

export const updateInviteLabel = action(async (raw: { jti: string, label?: string | null }) => {
  'use server'
  const { jti, label } = safeParseOrThrow(z.object({ jti: z.string().min(8), label: z.string().max(128).optional().nullable() }), raw, 'invites:updateLabel')
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  const userId = session?.user?.id
  if (!userId)
    throw new Response('Unauthorized', { status: 401 })

  const [inv] = await db.select().from(Invites).where(eq(Invites.jti, jti))
  if (!inv)
    throw new Response('Invite not found', { status: 404 })
  const formId = (inv as any).formId as string
  const [form] = await db.select().from(Forms).where(eq(Forms.id, formId))
  if (!form)
    throw new Response('Form not found', { status: 404 })
  ensureOwner(form, userId)

  await db.update(Invites).set({ label: (label ?? null) as any }).where(eq(Invites.jti, jti))
  return { ok: true }
}, 'invites:updateLabel')
