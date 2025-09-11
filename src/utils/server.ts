export function ensure<T>(
  value: T | undefined | null,
  message: string,
  init?: number | ResponseInit,
): T {
  if (value == null) {
    const defaultStatus = typeof message === 'string' && message.toLowerCase().includes('unauthorized') ? 401 : 400
    const responseInit: ResponseInit = typeof init === 'number'
      ? { status: init }
      : (init ?? { status: defaultStatus })
    throw new Response(message, responseInit)
  }
  return value
}
