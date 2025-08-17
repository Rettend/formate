/**
 * Best-effort type guard for AI SDK errors without importing from the SDK.
 */
export function isLikelyAIError(error: unknown): error is {
  name?: string
  message?: string
  type?: string
  code?: string
  statusCode?: number
  status?: number
  responseBody?: string
  cause?: unknown
} {
  if (!error || typeof error !== 'object')
    return false
  const e = error as any
  return (
    typeof e.name === 'string' && e.name.startsWith('AI_')
  ) || 'statusCode' in e || 'responseBody' in e || 'type' in e || 'code' in e
}

/**
 * Convert unknown AI SDK errors into a safe, user-facing message.
 * Keep details minimal to avoid leaking sensitive information.
 */
export function aiErrorToMessage(error: unknown, fallback = 'Something went wrong while contacting the AI provider.'): string {
  try {
    if (isLikelyAIError(error)) {
      const e = error as any
      const msg = typeof e.message === 'string' && e.message.length > 0 ? e.message : undefined
      if (msg)
        return msg

      const name = typeof e.name === 'string' ? e.name : 'AIError'
      return name
    }
    if (error instanceof Error)
      return error.message || fallback

    if (typeof error === 'string')
      return error

    return fallback
  }
  catch {
    return fallback
  }
}

/**
 * Log detailed AI SDK error information for diagnostics without exposing it to users.
 */
export function logAIError(error: unknown, context?: string) {
  const prefix = context ? `[AI:${context}]` : '[AI]'
  if (isLikelyAIError(error)) {
    const e = error as any
    const details: Record<string, unknown> = {
      name: e.name,
      message: e.message,
      type: e.type ?? undefined,
      code: e.code ?? undefined,
      statusCode: e.statusCode ?? e.status ?? undefined,
    }
    const causeMsg = typeof e.cause?.message === 'string'
      ? e.cause.message
      : (typeof e.cause === 'string' ? e.cause : undefined)
    if (causeMsg)
      details.cause = causeMsg

    if (typeof e.responseBody === 'string' && e.responseBody.length < 4_000)
      details.responseBody = e.responseBody

    console.error(prefix, 'AI SDK error', details)
    return
  }
  console.error(prefix, error)
}

/** Extract a useful cause string from an AI SDK error if available. */
export function extractAICause(error: unknown): string | undefined {
  try {
    if (!error || typeof error !== 'object')
      return undefined
    const e = error as any
    if (typeof e.cause?.message === 'string')
      return e.cause.message as string
    if (typeof e.cause === 'string')
      return e.cause as string
    if (typeof e.responseBody === 'string')
      return e.responseBody as string
  }
  catch {}
  return undefined
}
