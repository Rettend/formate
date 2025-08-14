import type { ModelMessage } from 'ai'
import { google } from '@ai-sdk/google'
import { generateObject, streamObject, streamText } from 'ai'

export { google, streamText }
export type { ModelMessage }

export function getProvider(provider: string, id: string) {
  switch (provider) {
    case 'google':
      return google(id)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export async function streamChatText(options: {
  messages: ModelMessage[]
  provider: string
  modelId: string
  abortSignal?: AbortSignal
}) {
  const model = getProvider(options.provider, options.modelId)
  return streamText({ model, messages: options.messages, abortSignal: options.abortSignal })
}

export async function generateStructured(options: {
  schema: any
  messages: ModelMessage[]
  provider: string
  modelId: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId)
  return generateObject({ model, schema: options.schema, messages: options.messages, providerOptions: options.providerOptions })
}

export function streamStructured(options: {
  schema: any
  messages: ModelMessage[]
  provider: string
  modelId: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId)
  return streamObject({ model, schema: options.schema, messages: options.messages, providerOptions: options.providerOptions })
}
