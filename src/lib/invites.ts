// No external deps required for invite helpers

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function isBase58String(s: string, min = 1, max = Number.POSITIVE_INFINITY): boolean {
  if (typeof s !== 'string')
    return false
  const n = s.length
  if (n < min || n > max)
    return false
  for (const ch of s) {
    if (!BASE58_ALPHABET.includes(ch))
      return false
  }

  return true
}

export function generateShortCode(length = 8): string {
  const out: string[] = []
  const len = BASE58_ALPHABET.length
  let rnd: () => number
  try {
    const u32 = new Uint32Array(1)
    const g = (globalThis as any).crypto
    if (g && typeof g.getRandomValues === 'function') {
      rnd = () => {
        g.getRandomValues(u32)
        return u32[0] / 0xFFFFFFFF
      }
    }
    else {
      rnd = Math.random
    }
  }
  catch {
    rnd = Math.random
  }
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(rnd() * len)
    out.push(BASE58_ALPHABET[idx])
  }
  return out.join('')
}

export function parseVanityOrCode(key: string, knownSlug?: string): string | null {
  if (!key)
    return null
  const parts = key.split('-')
  const tail = parts[parts.length - 1] || ''
  if (isBase58String(tail, 6, 24))
    return tail
  if (isBase58String(key, 6, 24) && (!knownSlug || key !== knownSlug))
    return key
  return null
}

export function extractTokenFromText(text: string): string | null {
  const s = (text || '').trim()
  if (!s)
    return null
  // Try URL parsing
  try {
    const url = new URL(s)
    const tok = url.searchParams.get('t')
    if (tok && tok.length > 10)
      return tok
  }
  catch {}
  // Try query substring
  if (s.includes('t=')) {
    try {
      const q = s.split('?')[1] || s
      const p = new URLSearchParams(q)
      const tok = p.get('t')
      if (tok && tok.length > 10)
        return tok
    }
    catch {}
  }
  // Fallback: JWT-ish
  if (s.split('.').length === 3 && s.length > 20)
    return s
  return null
}
