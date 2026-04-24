/**
 * lib/ai/groq-client.ts
 *
 * [Groq API 공통 클라이언트]
 *
 * Groq API 호출 보일러플레이트를 통합하여
 * 중복 코드를 제거하고 일관된 에러 처리를 제공합니다.
 * 
 * 내부적으로 aiClient (GroqProvider)를 사용하여 다중 키 순환을 지원합니다.
 */

import { GroqProvider } from './groq-provider'

const groqProvider = new GroqProvider()

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface GroqCallOptions {
    model?: string
    temperature?: number
    max_tokens?: number
}

/**
 * callGroq - Groq API 호출 통합 함수
 * 
 * @param messages 대화 메시지 배열
 * @param options 모델, temperature, max_tokens 설정
 * @returns AI 응답 텍스트
 * @throws GROQ_API_KEY 없거나 API 에러 시 예외 발생
 */
export async function callGroq(
    messages: GroqMessage[],
    options?: GroqCallOptions
): Promise<string> {
    const model = options?.model ?? 'llama-3.1-8b-instant'
    const temperature = options?.temperature ?? 0.1
    const maxTokens = options?.max_tokens ?? 500
    
    const systemMessage = messages.find(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    
    const userPrompt = userMessages.map(m => m.content).join('\n\n')
    
    const content = await groqProvider.complete(userPrompt, {
        model,
        temperature,
        maxTokens,
        systemPrompt: systemMessage?.content,
    })
    
    return content
}
