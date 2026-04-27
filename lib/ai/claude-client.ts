/**
 * lib/ai/claude-client.ts
 *
 * [Claude AI 공통 클라이언트]
 *
 * Claude API 호출을 통합하여 일관된 인터페이스를 제공합니다.
 * Claude 실패(크레딧 소진, 키 오류, 일별 예산 초과) 시 Groq으로 자동 폴백합니다.
 *
 * callGroq과 동일한 메시지 배열 인터페이스를 사용하므로 쉽게 교체 가능합니다.
 *
 * 사용 예시:
 * ```typescript
 * import { callClaude } from '@/lib/ai/claude-client'
 * const result = await callClaude([{ role: 'user', content: '판단해줘' }])
 * ```
 */

import { ClaudeProvider } from './claude-provider'
import { GroqProvider } from './groq-provider'
import { FallbackProvider } from './fallback-provider'

// Lazy initialization — 빌드 타임 환경변수 에러 방지
let cachedProvider: FallbackProvider | null = null

function getProvider(): FallbackProvider {
    if (!cachedProvider) {
        cachedProvider = new FallbackProvider(new ClaudeProvider(), new GroqProvider())
    }
    return cachedProvider
}

export interface ClaudeMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface ClaudeCallOptions {
    model?: string       // 기본값: 'claude-sonnet-4-6'
    temperature?: number // 기본값: 0.1
    max_tokens?: number  // 기본값: 500
}

/**
 * callClaude - Claude API 호출 통합 함수 (실패 시 Groq 폴백)
 *
 * 이슈 유효성 판단, 중복 체크 등 정확도가 중요한 작업에 사용합니다.
 * Claude 크레딧 소진, 키 오류, 일별 예산 초과 시 자동으로 Groq으로 전환합니다.
 *
 * @param messages 대화 메시지 배열 (system/user 역할 분리)
 * @param options 모델, temperature, max_tokens 설정
 * @returns AI 응답 텍스트
 */
export async function callClaude(
    messages: ClaudeMessage[],
    options?: ClaudeCallOptions
): Promise<string> {
    const model = options?.model ?? 'claude-sonnet-4-6'
    const temperature = options?.temperature ?? 0.1
    const maxTokens = options?.max_tokens ?? 500

    const systemMessage = messages.find(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    const userPrompt = userMessages.map(m => m.content).join('\n\n')

    const provider = getProvider()

    return provider.complete(userPrompt, {
        model,
        temperature,
        maxTokens,
        systemPrompt: systemMessage?.content,
    })
}
