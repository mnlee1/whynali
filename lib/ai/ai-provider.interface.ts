/**
 * lib/ai/ai-provider.interface.ts
 *
 * [AI 프로바이더 추상화 인터페이스]
 *
 * Groq, Perplexity 등 여러 AI 프로바이더를 통합하는 추상화 레이어입니다.
 * 프로바이더 교체 시 환경변수만 변경하면 됩니다.
 */

export interface AIOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
}

export interface AIProvider {
    complete(userPrompt: string, options?: AIOptions): Promise<string>
    readonly providerName: string
}
