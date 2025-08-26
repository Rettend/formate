import { query } from '@solidjs/router'
import { eq } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'
import { db } from './db'
import { Users } from './db/schema'

export const isPremium = query(async () => {
  'use server'
  const event = getRequestEvent()
  const session = await event?.locals.getSession()
  if (!session?.user)
    return false
  const [me] = await db
    .select({ isPremium: Users.isPremium })
    .from(Users)
    .where(eq(Users.id, session.user.id))
    .limit(1)
  return Boolean(me?.isPremium)
}, 'session')
