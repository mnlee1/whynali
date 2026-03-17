/**
 * lib/ai/ai-client.ts
 *
 * [AI 클라이언트 팩토리]
 *
 * 환경변수에 따라 적절한 AI 프로바이더를 생성합니다.
 * 프로바이더 교체 시 AI_PROVIDER 환경변수만 변경하면 됩니다.
 *
 * 지원 프로바이더:
 * - groq: Groq AI (무료, Llama 3.1 8B)
 * - claude: Anthropic Claude (유료, Haiku/Sonnet/Opus)
 *
 * Lazy initialization을 사용하여 빌드 타임에 환경변수가 필요하지 않도록 합니다.
 *
 * 사용 예시:
 * ```typescript
 * import { getAIClient } from '@/lib/ai/ai-client'
 * const client = getAIClient()
 * const response = await client.complete('안녕하세요')
 * ```
 */

import { GroqProvider } from './groq-provider'
import { ClaudeProvider } from './claude-provider'
import type { AIProvider } from './ai-provider.interface'

let cachedProvider: AIProvider | null = null

function createProvider(): AIProvider {
    const providerName = process.env.AI_PROVIDER ?? 'groq'

    switch (providerName) {
        case 'groq':
            return new GroqProvider()
        case 'claude':
            return new ClaudeProvider()
        // case 'perplexity':
        //     return new PerplexityProvider()
        default:
            throw new Error(`지원하지 않는 AI 프로바이더: ${providerName}`)
    }
}

/**
 * AI 클라이언트를 가져옵니다 (lazy initialization)
 */
export function getAIClient(): AIProvider {
    if (!cachedProvider) {
        cachedProvider = createProvider()
    }
    return cachedProvider
}

// 하위 호환성을 위한 deprecated export
export const aiClient: AIProvider = new Proxy({} as AIProvider, {
    get(target, prop) {
        return getAIClient()[prop as keyof AIProvider]
    }
})
