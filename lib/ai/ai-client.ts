/**
 * lib/ai/ai-client.ts
 *
 * [AI 클라이언트 팩토리]
 *
 * 환경변수에 따라 적절한 AI 프로바이더를 생성합니다.
 * 프로바이더 교체 시 AI_PROVIDER 환경변수만 변경하면 됩니다.
 *
 * 사용 예시:
 * ```typescript
 * import { aiClient } from '@/lib/ai/ai-client'
 * const response = await aiClient.complete('안녕하세요')
 * ```
 */

import { GroqProvider } from './groq-provider'
import type { AIProvider } from './ai-provider.interface'

function createProvider(): AIProvider {
    const providerName = process.env.AI_PROVIDER ?? 'groq'

    switch (providerName) {
        case 'groq':
            return new GroqProvider()
        // case 'perplexity':
        //     return new PerplexityProvider()
        default:
            throw new Error(`지원하지 않는 AI 프로바이더: ${providerName}`)
    }
}

export const aiClient: AIProvider = createProvider()
