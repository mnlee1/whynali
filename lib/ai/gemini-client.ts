/**
 * lib/ai/gemini-client.ts
 *
 * [Gemini API 공통 클라이언트]
 *
 * groq-client.ts와 동일한 형태의 얇은 래퍼.
 * 내부적으로 GeminiProvider를 사용한다.
 */

import { GeminiProvider } from './gemini-provider'

const geminiProvider = new GeminiProvider()

export interface GeminiMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface GeminiCallOptions {
    model?: string
    temperature?: number
    max_tokens?: number
    jsonMode?: boolean
}

export async function callGemini(
    messages: GeminiMessage[],
    options?: GeminiCallOptions
): Promise<string> {
    const model = options?.model ?? 'gemini-3.6-flash'
    const temperature = options?.temperature ?? 0.1
    const maxTokens = options?.max_tokens ?? 2000

    const systemMessage = messages.find(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    const userPrompt = userMessages.map(m => m.content).join('\n\n')

    return geminiProvider.complete(userPrompt, {
        model,
        temperature,
        maxTokens,
        systemPrompt: systemMessage?.content,
        jsonMode: options?.jsonMode,
    })
}
