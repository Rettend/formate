export const providers = [
  { id: 'google', title: 'Google', placeholder: '...' },
] as const

export type Provider = (typeof providers)[number]['id']

export interface ModelConfigObject {
  value: string
  alias?: string
  mode?: 'json' | 'auto'
  providerType?: 'azure-openai' | 'azure-ai-inference'
  iq?: 0 | 1 | 2 | 3 | 4 | 5
  speed?: 0 | 1 | 2 | 3 | 4 | 5
}

export const models: Record<Provider, ModelConfigObject[]> = {
  google: [
    { value: 'gemini-2.5-pro', alias: 'Gemini 2.5 Pro', iq: 5, speed: 3 },
    { value: 'gemini-2.5-flash', alias: 'Gemini 2.5 Flash', iq: 4, speed: 4 },
    { value: 'gemini-2.5-flash-lite', alias: 'Gemini 2.5 Flash Lite', iq: 3, speed: 5 },
  ],
}

export function getModelAlias(config?: ModelConfigObject | null) {
  if (!config)
    return ''
  return config.alias ?? config.value
}
