export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamResult {
  stream: ReadableStream<string>
  finalText: Promise<string>
}

export interface AIProvider {
  streamAIReply: (input: { messages: ChatMessage[], signal?: AbortSignal }) => StreamResult
}

// Placeholder implementation; will be replaced with Vercel AI SDK (v5) using Google provider
export class NoopAI implements AIProvider {
  streamAIReply({ messages }: { messages: ChatMessage[] }): StreamResult {
    const last = messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
    const reply = `Thanks for your message: ${last}`
    const stream = new ReadableStream<string>({
      start(controller) {
        // Trivial chunking
        const chunks = reply.match(/.{1,12}/g) ?? [reply]
        let i = 0
        const tick = () => {
          if (i < chunks.length) {
            controller.enqueue(chunks[i++])
            setTimeout(tick, 60)
          }
          else {
            controller.close()
          }
        }
        setTimeout(tick, 60)
      },
    })
    return { stream, finalText: Promise.resolve(reply) }
  }
}

export function getAI(): AIProvider {
  // Swap to a Vercel AI SDK backed provider when API keys present
  return new NoopAI()
}
