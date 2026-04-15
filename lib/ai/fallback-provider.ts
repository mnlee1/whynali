/**
 * lib/ai/fallback-provider.ts
 *
 * [Fallback AI 프로바이더]
 *
 * 1순위 프로바이더(Claude) 실패 시 2순위(Groq)로 자동 전환합니다.
 *
 * 전환 조건:
 * - 크레딧 부족 (400 insufficient_balance)
 * - API 키 오류 (401)
 * - 서비스 이용 불가 (503)
 * - Rate Limit 외 기타 에러
 *
 * 전환하지 않는 경우:
 * - Rate Limit (429) → 키 순환 후 재시도 (각 프로바이더 내부에서 처리)
 */

import type { AIProvider, AIOptions } from './ai-provider.interface'

// Fallback 트리거 에러 타입
const FALLBACK_ERROR_TYPES = [
    'invalid_request_error',   // 크레딧 부족, 잘못된 요청
    'authentication_error',    // API 키 오류
    'permission_error',        // 권한 없음
    'overloaded_error',        // 서버 과부하
]

const FALLBACK_HTTP_STATUS = [400, 401, 403, 503]

function shouldFallback(error: any): boolean {
    if (FALLBACK_HTTP_STATUS.includes(error?.status)) return true
    if (FALLBACK_ERROR_TYPES.includes(error?.type)) return true
    if (error?.message?.includes('credit balance')) return true
    if (error?.message?.includes('insufficient')) return true
    if (error?.message?.includes('일별 예산 초과')) return true
    return false
}

export class FallbackProvider implements AIProvider {
    readonly providerName = 'fallback'

    constructor(
        private primary: AIProvider,
        private secondary: AIProvider
    ) {}

    async complete(userPrompt: string, options?: AIOptions): Promise<string> {
        try {
            const result = await this.primary.complete(userPrompt, options)
            return result
        } catch (error: any) {
            if (!shouldFallback(error)) {
                throw error
            }

            console.warn(
                `[FallbackProvider] ${this.primary.providerName} 실패 (${error?.status ?? error?.message?.slice(0, 50)}) → ${this.secondary.providerName}으로 전환`
            )

            // 2순위 프로바이더에 맞는 모델로 교체
            const fallbackOptions = options
                ? { ...options, model: 'llama-3.1-8b-instant' }
                : { model: 'llama-3.1-8b-instant' }

            return this.secondary.complete(userPrompt, fallbackOptions)
        }
    }
}
