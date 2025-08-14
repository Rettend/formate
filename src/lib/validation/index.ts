import { z } from 'zod'

// Base64url-encoded 16-byte ID (uuid v7 -> 22 chars after base64url), permissive to any base64url
export const idSchema = z
  .string()
  .regex(/^[\w-]{16,24}$/u, 'Invalid id format')

// Generic helper: safe-parse and throw a compact Error on failure
export function safeParseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown, ctx?: string): z.infer<T> {
  const res = schema.safeParse(data)
  if (!res.success) {
    const pretty = (z as any).prettifyError
      ? (z as any).prettifyError(res.error)
      : JSON.stringify(res.error.issues)
    const prefix = ctx ? `${ctx} validation failed` : 'Validation failed'
    throw new Error(`${prefix}: ${pretty}`)
  }
  return res.data
}

// Common pagination schema (coerces from strings)
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(50),
})

export type Pagination = z.infer<typeof paginationSchema>
