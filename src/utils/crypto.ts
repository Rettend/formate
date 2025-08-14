const STORAGE_KEY = 'encrypt'
const SALT_LENGTH = 16

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  // Try to get existing key from localStorage
  const storedKey = localStorage.getItem(STORAGE_KEY)
  if (storedKey) {
    const keyData = new Uint8Array(JSON.parse(storedKey))
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt'],
    )
  }

  // Generate new key if none exists
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )

  // Store key
  const exportedKey = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Uint8Array(exportedKey))))

  return key
}

export async function encryptApiKey(text: string): Promise<string> {
  const key = await getOrCreateEncryptionKey()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const encodedText = new TextEncoder().encode(text)

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: salt },
    key,
    encodedText,
  )

  const encryptedArray = new Uint8Array(encryptedData)
  const combined = new Uint8Array(salt.length + encryptedArray.length)
  combined.set(salt)
  combined.set(encryptedArray, salt.length)

  return btoa(String.fromCharCode(...combined))
}

export async function decryptApiKey(encrypted: string): Promise<string> {
  const key = await getOrCreateEncryptionKey()
  const combined = new Uint8Array(
    atob(encrypted).split('').map(c => c.charCodeAt(0)),
  )

  const salt = combined.slice(0, SALT_LENGTH)
  const encryptedData = combined.slice(SALT_LENGTH)

  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: salt },
    key,
    encryptedData,
  )

  return new TextDecoder().decode(decryptedData)
}
