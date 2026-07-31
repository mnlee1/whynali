/**
 * lib/ai/gemini-client.ts
 *
 * [Gemini API 공통 클라이언트]
 *
 * groq-client.ts와 동일한 형태의 얇은 래퍼.
 * 내부적으로 GeminiProvider를 사용한다.
 *
 * callGemini(타임라인 요약용, whynali timeline AI 프로젝트)와
 * callGeminiBlog(블로그 초안 전용, whynali blog AI 프로젝트)는 서로 다른 구글 프로젝트의
 * 키를 쓰는 별도 인스턴스라 무료 할당량이 완전히 분리되어 있다 — 한쪽을 아무리 테스트해도
 * 다른 쪽 할당량에 영향이 없다.
 */

import { GeminiProvider } from './gemini-provider'

// lazy 초기화: 모듈을 import만 해도 즉시 키 검증이 실행되면, 관련 env var가
// 설정 안 된 환경(예: Vercel 배포 초기)에서 이 파일을 참조하는 라우트 전체의 빌드가
// 깨질 수 있다 — 실제로 관리자 이슈 병합 라우트에서 이 문제가 발생해 반영함
let geminiProvider: GeminiProvider | null = null
function getGeminiProvider(): GeminiProvider {
    if (!geminiProvider) {
        geminiProvider = new GeminiProvider()
    }
    return geminiProvider
}

let geminiBlogProvider: GeminiProvider | null = null
function getGeminiBlogProvider(): GeminiProvider {
    if (!geminiBlogProvider) {
        geminiBlogProvider = new GeminiProvider('GEMINI_API_KEY_BLOG')
    }
    return geminiBlogProvider
}

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

async function runGemini(
    provider: GeminiProvider,
    messages: GeminiMessage[],
    options?: GeminiCallOptions
): Promise<string> {
    const model = options?.model ?? 'gemini-3.5-flash-lite'
    const temperature = options?.temperature ?? 0.1
    const maxTokens = options?.max_tokens ?? 2000

    const systemMessage = messages.find(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    const userPrompt = userMessages.map(m => m.content).join('\n\n')

    return provider.complete(userPrompt, {
        model,
        temperature,
        maxTokens,
        systemPrompt: systemMessage?.content,
        jsonMode: options?.jsonMode,
    })
}

export async function callGemini(
    messages: GeminiMessage[],
    options?: GeminiCallOptions
): Promise<string> {
    return runGemini(getGeminiProvider(), messages, options)
}

/** 블로그 초안 전용 — whynali blog AI 프로젝트의 전용 키를 사용해 다른 기능과 할당량을 공유하지 않는다. */
export async function callGeminiBlog(
    messages: GeminiMessage[],
    options?: GeminiCallOptions
): Promise<string> {
    return runGemini(getGeminiBlogProvider(), messages, options)
}
