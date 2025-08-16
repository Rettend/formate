import { Buffer } from 'node:buffer'
import bs58 from 'bs58'
import { v7 } from 'uuid'

export function uuidV7Base58(): string {
  const uuidBytes = v7(undefined, Buffer.alloc(16))
  return bs58.encode(uuidBytes)
}
