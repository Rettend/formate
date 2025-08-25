import type { ModelMessage } from 'ai'
import type { Provider } from './lists'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, streamObject, streamText } from 'ai'

export { streamText }
export type { ModelMessage }

export function getProvider(provider: Provider, id: string, apiKey?: string) {
  switch (provider) {
    case 'formate': {
      return createAzure({ apiKey })(id)
    }
    case 'openai': {
      return createOpenAI({ apiKey })(id)
    }
    case 'google': {
      return createGoogleGenerativeAI({ apiKey })(id)
    }
    case 'xai': {
      return createOpenAI({ apiKey })(id)
    }
    case 'anthropic': {
      return createAnthropic({ apiKey })(id)
    }
    case 'groq': {
      return createGroq({ apiKey })(id)
    }
    case 'cerebras': {
      return createCerebras({ apiKey })(id)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export async function streamChatText(options: {
  messages: ModelMessage[]
  provider: Provider
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
  provider: Provider
  modelId: string
  apiKey?: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId, options.apiKey)
  return generateObject({
    model,
    schema: options.schema,
    messages: options.messages,
    providerOptions: options.providerOptions,
  })
}

export function streamStructured(options: {
  schema: any
  messages: ModelMessage[]
  provider: Provider
  modelId: string
  apiKey?: string
  providerOptions?: any
}) {
  const model = getProvider(options.provider, options.modelId, options.apiKey)
  return streamObject({ model, schema: options.schema, messages: options.messages, providerOptions: options.providerOptions })
}
