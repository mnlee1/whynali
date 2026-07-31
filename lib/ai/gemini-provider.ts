/**
 * lib/ai/gemini-provider.ts
 *
 * [Gemini AI 프로바이더 구현]
 *
 * Google Gemini API를 통한 AI 호출을 담당합니다.
 * Groq/Claude와 동일한 AIProvider 인터페이스를 구현합니다.
 *
 * 무료 티어 사용 전제 (whynali timeline AI 프로젝트, 결제 계정 미연결, GEMINI_API_KEY_TIMELINE 사용):
 * - gemini-2.0-flash는 이 프로젝트에서 무료 할당량이 0이라 사용 불가 (실측 확인)
 * - gemini-3.6-flash(별칭 gemini-flash-latest)는 프리뷰 성격이라 일일 요청 한도가 20회로
 *   극히 낮음 (실측: 20번째 호출에서 429, quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier,
 *   quotaValue 20) — 대신 gemini-3.5-flash-lite(별칭 gemini-flash-lite-latest가 가리키는
 *   실제 버전)로 고정 사용. 연속 15회 호출 실측으로 훨씬 넉넉한 한도 확인함
 * - 절대 이 프로젝트에 결제 계정을 연결하지 말 것 — 연결 순간 무료 티어가 사라지고
 *   모든 호출이 첫 토큰부터 과금 대상으로 전환됨 (Google 공식 문서 확인 사항)
 *
 * 안전 설정: 이 앱은 정치·사회 논란을 사실 기반으로 다루는 뉴스 서비스라
 * 기본 안전 필터(특히 HARM_CATEGORY_CIVIC_INTEGRITY - 정치/선거 관련)가
 * 정상적인 뉴스 요약까지 차단할 수 있어 전부 BLOCK_NONE으로 설정한다.
 */

import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} from '@google/generative-ai'
import { supabaseAdmin } from '@/lib/supabase-server'
import { incrementApiUsage } from '@/lib/api-usage-tracker'
import type { AIProvider, AIOptions } from './ai-provider.interface'

interface KeyStatus {
    keyHash: string
    apiKey: string
    isBlocked: boolean
    blockedUntil: string | null
}

const SAFETY_SETTINGS = [
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }))

export class GeminiProvider implements AIProvider {
    readonly providerName = 'gemini'
    private keys: string[] = []
    private apiKeyEnvVar: string

    // apiKeyEnvVar로 서로 다른 구글 프로젝트(무료 할당량 별도)를 쓰는 여러 인스턴스를 만들 수 있다
    // — 기본값은 기존 타임라인 요약용 프로젝트, 다른 기능은 전용 env var를 넘겨 격리한다.
    constructor(apiKeyEnvVar: string = 'GEMINI_API_KEY_TIMELINE') {
        this.apiKeyEnvVar = apiKeyEnvVar
        this.loadKeys()
    }

    private loadKeys() {
        const apiKey = process.env[this.apiKeyEnvVar]

        if (!apiKey) {
            throw new Error(`${this.apiKeyEnvVar} 환경변수가 설정되지 않았습니다`)
        }

        this.keys = apiKey
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)

        if (this.keys.length === 0) {
            throw new Error(`유효한 ${this.apiKeyEnvVar}가 없습니다`)
        }

        console.log(`[GeminiProvider:${this.apiKeyEnvVar}] ${this.keys.length}개 API 키 로드 완료`)
    }

    private getKeyHash(apiKey: string): string {
        return apiKey.slice(-8)
    }

    private async getAvailableKey(): Promise<KeyStatus | null> {
        const now = new Date().toISOString()
        const keyStatuses: KeyStatus[] = []

        for (const apiKey of this.keys) {
            const keyHash = this.getKeyHash(apiKey)

            const { data, error } = await supabaseAdmin
                .from('ai_key_status')
                .select('is_blocked, blocked_until')
                .eq('provider', 'gemini')
                .eq('key_hash', keyHash)
                .maybeSingle()

            if (error) {
                console.error(`[GeminiProvider:${this.apiKeyEnvVar}] 키 상태 조회 에러:`, error)
                continue
            }

            if (!data) {
                keyStatuses.push({ keyHash, apiKey, isBlocked: false, blockedUntil: null })
                continue
            }

            const isBlocked = data.is_blocked && data.blocked_until && data.blocked_until > now

            if (data.is_blocked && data.blocked_until && data.blocked_until <= now) {
                await supabaseAdmin
                    .from('ai_key_status')
                    .update({ is_blocked: false, blocked_until: null, fail_count: 0, updated_at: now })
                    .eq('provider', 'gemini')
                    .eq('key_hash', keyHash)

                console.log(`[GeminiProvider:${this.apiKeyEnvVar}] 키 복구: ...${keyHash}`)
            }

            keyStatuses.push({ keyHash, apiKey, isBlocked, blockedUntil: data.blocked_until })
        }

        const availableKeys = keyStatuses.filter((k) => !k.isBlocked)
        const available = availableKeys.length > 0
            ? availableKeys[Math.floor(Math.random() * availableKeys.length)]
            : undefined

        if (!available) {
            const blockedKeys = keyStatuses.filter((k) => k.blockedUntil)
            if (blockedKeys.length > 0) {
                const minBlockedUntil = blockedKeys.reduce((min, k) => {
                    if (!k.blockedUntil) return min
                    return !min || k.blockedUntil < min ? k.blockedUntil : min
                }, null as string | null)
                if (minBlockedUntil) {
                    const waitSeconds = Math.ceil((new Date(minBlockedUntil).getTime() - Date.now()) / 1000)
                    console.error(`[GeminiProvider:${this.apiKeyEnvVar}] 모든 키 차단됨. ${waitSeconds}초 후 재시도 가능`)
                }
            }
            return null
        }

        return available
    }

    private async markKeyAsBlocked(keyHash: string, retryAfterSeconds?: number): Promise<void> {
        const blockDuration = retryAfterSeconds ? retryAfterSeconds * 1000 : 60 * 1000
        const blockedUntil = new Date(Date.now() + blockDuration).toISOString()
        const now = new Date().toISOString()

        const { data: existing } = await supabaseAdmin
            .from('ai_key_status')
            .select('fail_count')
            .eq('provider', 'gemini')
            .eq('key_hash', keyHash)
            .maybeSingle()

        const nextFailCount = (existing?.fail_count ?? 0) + 1

        const { error } = await supabaseAdmin
            .from('ai_key_status')
            .upsert(
                {
                    provider: 'gemini',
                    key_hash: keyHash,
                    is_blocked: true,
                    blocked_until: blockedUntil,
                    fail_count: nextFailCount,
                    updated_at: now,
                },
                { onConflict: 'provider,key_hash' }
            )

        if (error) {
            console.error(`[GeminiProvider:${this.apiKeyEnvVar}] 키 차단 상태 저장 에러:`, error)
            return
        }

        console.warn(`[GeminiProvider:${this.apiKeyEnvVar}] Rate Limit - 키 차단: ...${keyHash} (${Math.floor(blockDuration / 1000)}초 후 재시도)`)
    }

    async complete(userPrompt: string, options?: AIOptions): Promise<string> {
        const model = options?.model ?? 'gemini-3.5-flash-lite'
        const temperature = options?.temperature ?? 0.1
        const maxTokens = options?.maxTokens ?? 2000
        const systemPrompt = options?.systemPrompt

        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const keyStatus = await this.getAvailableKey()

            if (!keyStatus) {
                throw new Error('모든 Gemini API 키가 Rate Limit 상태입니다. 잠시 후 다시 시도해주세요.')
            }

            if (attempt > 0) {
                console.log(`[GeminiProvider:${this.apiKeyEnvVar}] ${attempt + 1}회 재시도 - 키: ...${keyStatus.keyHash}`)
            }

            try {
                // gemini-3.5-flash-lite도 내부적으로 "생각(thinking)" 토큰을 쓰는데(실측 700~1000토큰),
                // 이 SDK 버전(@google/generative-ai)은 thinkingConfig로 끄는 게 안 먹혀서(400 에러)
                // 넉넉한 여유를 두는 방식으로 대응한다. Gemini는 전체 한도가 워낙 커서
                // (Groq처럼 이 여유분 자체가 한도를 위협하지 않음) 부담 없이 적용 가능
                const effectiveMaxTokens = Math.max(maxTokens, 5000)

                const genAI = new GoogleGenerativeAI(keyStatus.apiKey)
                const genModel = genAI.getGenerativeModel({
                    model,
                    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
                    safetySettings: SAFETY_SETTINGS,
                    generationConfig: {
                        temperature,
                        maxOutputTokens: effectiveMaxTokens,
                        ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
                    },
                })

                const result = await genModel.generateContent(userPrompt)
                const response = result.response

                if (!response.candidates || response.candidates.length === 0) {
                    const blockReason = response.promptFeedback?.blockReason
                    throw new Error(`Gemini 응답에 candidates가 없습니다${blockReason ? ` (차단 사유: ${blockReason})` : ''}`)
                }

                const content = response.text()

                if (!content) {
                    if (attempt < maxRetries - 1) {
                        console.warn(`[GeminiProvider:${this.apiKeyEnvVar}] content 없음 (시도 ${attempt + 1}/${maxRetries}) - 재시도`)
                        await new Promise((resolve) => setTimeout(resolve, 1000))
                        continue
                    }
                    throw new Error('Gemini API 응답에 content가 없습니다')
                }

                const usage = response.usageMetadata
                incrementApiUsage('gemini', {
                    calls: 1,
                    successes: 1,
                    inputTokens: usage?.promptTokenCount ?? 0,
                    outputTokens: usage?.candidatesTokenCount ?? 0,
                }).catch(() => {})

                return content.trim()
            } catch (error: any) {
                const isRateLimit =
                    error.status === 429 ||
                    error.message?.includes('429') ||
                    error.message?.includes('rate limit') ||
                    error.message?.includes('quota')

                if (!isRateLimit) {
                    incrementApiUsage('gemini', { calls: 1, failures: 1 }).catch(() => {})
                    console.error(`[GeminiProvider:${this.apiKeyEnvVar}] API 호출 실패 (키: ...${keyStatus.keyHash}):`, error.message?.slice(0, 300))
                    throw error
                }

                await this.markKeyAsBlocked(keyStatus.keyHash)

                if (attempt === maxRetries - 1) {
                    throw new Error(`Gemini API Rate Limit: ${maxRetries}회 재시도 실패`)
                }

                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        throw new Error('Gemini API 호출 실패: 최대 재시도 횟수 초과')
    }
}
