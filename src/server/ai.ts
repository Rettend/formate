import { eq } from 'drizzle-orm'
import { serverEnv } from '~/env/server'
import { db } from './db'
import { Users } from './db/schema'

function assertAzureConfigured() {
  if (!serverEnv.AZURE_API_KEY || !serverEnv.AZURE_RESOURCE_NAME)
    throw new Response('Formate provider is not configured on the server.', { status: 500 })
}

export async function assertProviderAllowedForUser(provider: string, userId: string): Promise<void> {
  if (provider !== 'formate')
    return
  assertAzureConfigured()
  const [me] = await db
    .select({ isPremium: Users.isPremium })
    .from(Users)
    .where(eq(Users.id, userId))
    .limit(1)
  const premium = Boolean(me?.isPremium)
  if (!premium)
    throw new Response('Formate provider is available to premium accounts only.', { status: 403 })
}
