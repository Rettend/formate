export interface ProviderDefinition {
  id: string
  title: string
  placeholder?: string
}

export const providers: ProviderDefinition[] = [
  { id: 'formate', title: 'Formate' },
  { id: 'openai', title: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', title: 'Google', placeholder: '...' },
  { id: 'xai', title: 'xAI', placeholder: 'xai-...' },
  { id: 'anthropic', title: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'groq', title: 'Groq', placeholder: 'gsk_...' },
  { id: 'cerebras', title: 'Cerebras', placeholder: 'csk-...' },
  { id: 'fireworks', title: 'Fireworks', placeholder: 'fw_...' },
  { id: 'openrouter', title: 'OpenRouter', placeholder: 'sk-or-v1-...' },
] as const

export type Provider = (typeof providers)[number]['id']

export interface ModelConfigObject {
  value: string
  alias?: string
  mode?: 'json' | 'auto'
  iq?: 0 | 1 | 2 | 3 | 4 | 5
  speed?: 0 | 1 | 2 | 3 | 4 | 5
}

/**
 * Scoring system
 *
 * IQ (Artificial Analysis Intelligence Index -> 0..5):
 * - 65+ => 5
 * - 55-64 => 4
 * - 45-54 => 3
 * - 35-44 => 2
 * - 25-34 => 1
 * - <25  => 0
 *
 * Speed (Median output tokens/s -> 0..5):
 * - 260+ => 5
 * - 180-259 => 4
 * - 120-179 => 3
 * - 60-119 => 2
 * - 25-59 => 1
 * - <25 => 0
 */
export const models: Record<Provider, ModelConfigObject[]> = {
  formate: [
    // OpenAI GPT-5 (high): AAII 68
    { value: 'gpt-5', alias: 'GPT-5', iq: 5, speed: 3 },
    // OpenAI GPT-5 mini (medium): AAII 64
    { value: 'gpt-5-mini', alias: 'GPT-5 mini', iq: 4, speed: 3 },
    // OpenAI GPT-5 nano (medium): AAII 54
    { value: 'gpt-5-nano', alias: 'GPT-5 nano', iq: 3, speed: 3 },
    // OpenAI GPT-4.1: AAII 47
    { value: 'gpt-4.1', alias: 'GPT-4.1', iq: 3, speed: 3 },
    { value: 'model-router', alias: 'Auto', iq: 3, speed: 3 },
  ],
  openai: [
    // GPT-5 (medium): AAII 68, 180 tps
    { value: 'gpt-5', alias: 'GPT-5', iq: 5, speed: 3 },
    // GPT-5 mini (medium): AAII 64, 75 tps - not right, faster than gpt-5
    { value: 'gpt-5-mini', alias: 'GPT-5 mini', iq: 4, speed: 4 },
    // GPT-5 nano (medium): AAII 54, 186 tps
    { value: 'gpt-5-nano', alias: 'GPT-5 nano', iq: 3, speed: 4 },
    // GPT-4.1: AAII 47, 119 tps
    { value: 'gpt-4.1', alias: 'GPT-4.1', iq: 3, speed: 2 },
  ],
  google: [
    // Gemini 2.5 Pro: AAII 65, 144 tps
    { value: 'gemini-2.5-pro', alias: 'Gemini 2.5 Pro', iq: 5, speed: 3 },
    // Gemini 2.5 Flash: AAII 58, 259 tps
    { value: 'gemini-2.5-flash', alias: 'Gemini 2.5 Flash', iq: 4, speed: 4 },
    // Gemini 2.5 Flash Lite (non-reasoning): AAII 35, 293 tps
    { value: 'gemini-2.5-flash-lite', alias: 'Gemini 2.5 Flash Lite', iq: 2, speed: 5 },
  ],
  xai: [
    // Grok 4: AAII 68, 51 tps
    { value: 'grok-4-0709', alias: 'Grok 4', iq: 5, speed: 1 },
    // Grok 3: AAII 40, 34 tps
    { value: 'grok-3', alias: 'Grok 3', iq: 2, speed: 1 },
    // Grok 3 mini Reasoning (high): AAII 58, 188 tps
    { value: 'grok-3-mini', alias: 'Grok 3 mini', iq: 4, speed: 4 },
  ],
  anthropic: [
    // Claude 4.1 Opus (non-reasoning): AAII 49, 22 tps
    { value: 'claude-opus-4-1', alias: 'Claude Opus 4.1', iq: 3, speed: 0 },
    // Claude 4 Opus (non-reasoning): AAII 47, 37 tps
    { value: 'claude-opus-4-0', alias: 'Claude Opus 4', iq: 3, speed: 1 },
    // Claude 4 Sonnet (non-reasoning): AAII 46, 70 tps
    { value: 'claude-sonnet-4-0', alias: 'Claude Sonnet 4', iq: 3, speed: 2 },
  ],
  groq: [
    // gpt-oss-120B (high): AAII 61, 500 tps
    { value: 'openai/gpt-oss-120b', alias: 'gpt-oss 120B', iq: 4, speed: 5 },
    // gpt-oss-20B (high): AAII 49, 1000 tps
    { value: 'openai/gpt-oss-20b', alias: 'gpt-oss 20B', iq: 3, speed: 5 },
    // Kimi K2: AAII 49, 200 tps
    { value: 'moonshotai/kimi-k2-instruct', alias: 'Kimi K2', iq: 3, speed: 4 },
    // Qwen 3 32B: AAII 44 (removed), 400 tps
    { value: 'qwen-3-32b', alias: 'Qwen 3 32B', iq: 2, speed: 5 },
    // Llama 4 Maverick: AAII 42, 600 tps
    { value: 'meta-llama/llama-4-maverick-17b-128e-instruct', alias: 'Llama 4 Maverick', iq: 2, speed: 5 },
    // Llama 4 Scout: AAII 33, 750 tps
    { value: 'meta-llama/llama-4-scout-17b-16e-instruct', alias: 'Llama 4 Scout', iq: 1, speed: 5 },
  ],
  cerebras: [
    // gpt-oss-120B (high): AAII 61, 2800 tps
    { value: 'gpt-oss-120b', alias: 'gpt-oss 120B', iq: 4, speed: 5 },
    // Qwen 3 235B Reasoning: AAII 64, 1700 tps
    { value: 'qwen-3-235b-a22b-thinking-2507', alias: 'Qwen 3 235B Thinking', iq: 4, speed: 5 },
    // Qwen 3 235B: AAII 51, 1400 tps
    { value: 'qwen-3-235b-a22b-instruct-2507', alias: 'Qwen 3 235B', iq: 3, speed: 5 },
    // Llama 4 Maverick: AAII 42, 2400 tps
    { value: 'llama-4-maverick-17b-128e-instruct', alias: 'Llama 4 Maverick', iq: 2, speed: 5 },
    // Llama 4 Scout: AAII 33, 2600 tps
    { value: 'llama-4-scout-17b-16e-instruct', alias: 'Llama 4 Scout', iq: 1, speed: 5 },
  ],
  fireworks: [
    // Qwen 3 235B Thinking: AAII 64, 117 tps
    { value: 'accounts/fireworks/models/qwen3-235b-a22b-thinking-2507', alias: 'Qwen 3 235B Thinking', iq: 4, speed: 2 },
    // Qwen 3 235B: AAII 51, 98 tps
    { value: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507', alias: 'Qwen 3 235B', iq: 3, speed: 2 },
    // DeepSeek V3.1: AAII 49, 19 tps
    { value: 'accounts/fireworks/models/deepseek-v3p1', alias: 'DeepSeek V3.1', iq: 3, speed: 0 },
  ],
  openrouter: [
    // Claude Sonnet 4 (non-reasoning): AAII 46, 70 tps
    { value: 'anthropic/claude-sonnet-4', alias: 'Claude Sonnet 4', iq: 3, speed: 2 },
    // Gemini 2.5 Pro: AAII 65, 144 tps
    { value: 'google/gemini-2.5-pro', alias: 'Gemini 2.5 Pro', iq: 5, speed: 3 },
    // Grok 4: AAII 68, 51 tps
    { value: 'x-ai/grok-4', alias: 'Grok 4', iq: 5, speed: 1 },
    // DeepSeek V3.1: AAII 49, 32 tps
    { value: 'deepseek/deepseek-chat-v3.1', alias: 'DeepSeek V3.1', iq: 3, speed: 1 },
  ],
}

export function getModelAlias(config?: ModelConfigObject | null) {
  if (!config)
    return ''
  return config.alias ?? config.value
}
