import { z } from 'zod'

export const serverScheme = z.object({
  AUTH_GITHUB_ID: z.string(),
  AUTH_GITHUB_SECRET: z.string(),
  AUTH_GOOGLE_ID: z.string(),
  AUTH_GOOGLE_SECRET: z.string(),
  AUTH_SECRET: z.string(),
  TURSO_DB_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string(),
  AZURE_RESOURCE_NAME: z.string().optional(),
  AZURE_API_KEY: z.string().optional(),
})

export const clientScheme = z.object({
})

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  env: Record<string, string | undefined>,
  context: string,
): z.infer<T> {
  const result = schema.safeParse(env)

  if (!result.success) {
    console.error(z.prettifyError(result.error))
    throw new Error(`Invalid ${context} environment variables`)
  }

  return result.data
}
