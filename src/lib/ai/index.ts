import type { ModelMessage } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject, streamObject, streamText } from 'ai'
import { serverEnv } from '~/env/server'

export { streamText }
export type { ModelMessage }

export function getProvider(provider: string, id: string, apiKey?: string) {
  switch (provider) {
    case 'google': {
      const key = apiKey || serverEnv.GOOGLE_GENERATIVE_AI_API_KEY
      if (!key)
        throw new Error('Missing Google Generative AI API key')
      return createGoogleGenerativeAI({ apiKey: key })(id)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export async function streamChatText(options: {
  messages: ModelMessage[]
  provider: string
  modelId: string
  apiKey?: string
  abortSignal?: AbortSignal
}) {
  const model = getProvider(options.provider, options.modelId, options.apiKey)
  return streamText({ model, messages: options.messages, abortSignal: options.abortSignal })
}

export async function generateStructured(options: {
  schema: any
  messages: ModelMessage[]
  provider: string
  modelId: string
  apiKey?: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId, options.apiKey)
  return generateObject({ model, schema: options.schema, messages: options.messages, providerOptions: options.providerOptions })
}

export function streamStructured(options: {
  schema: any
  messages: ModelMessage[]
  provider: string
  modelId: string
  apiKey?: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId, options.apiKey)
  return streamObject({ model, schema: options.schema, messages: options.messages, providerOptions: options.providerOptions })
}
