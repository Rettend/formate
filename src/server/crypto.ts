import { serverEnv } from '~/env/server'

const TEXT = new TextEncoder()
const BYTES = new TextDecoder()

async function getKey(): Promise<CryptoKey> {
  const secret = serverEnv.AUTH_SECRET
  const hash = await crypto.subtle.digest('SHA-256', TEXT.encode(secret))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plain: string): Promise<string> {
  if (!plain)
    throw new Error('Nothing to encrypt')
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TEXT.encode(plain))
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(cipherBuf), iv.byteLength)
  // Base64 encode
  let binary = ''
  for (let i = 0; i < combined.length; i++)
    binary += String.fromCharCode(combined[i])
  return btoa(binary)
}

export async function decryptSecret(ciphertextB64: string): Promise<string> {
  if (!ciphertextB64)
    throw new Error('Nothing to decrypt')
  const key = await getKey()
  const bytes = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0))
  const iv = bytes.slice(0, 12)
  const data = bytes.slice(12)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return BYTES.decode(plainBuf)
}
