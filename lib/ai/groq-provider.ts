/**
 * lib/ai/groq-provider.ts
 *
 * [Groq AI 프로바이더 구현]
 *
 * Groq API를 통한 AI 호출을 담당합니다.
 * 다중 키 순환 및 Rate Limit 처리를 Supabase DB 기반으로 구현합니다.
 *
 * 특징:
 * - 키 차단 상태를 Supabase에 저장하여 서버리스 인스턴스 간 공유
 * - 429 에러 발생 시 자동으로 다음 키로 전환
 * - blocked_until 지난 키는 자동 복구
 */

import Groq from 'groq-sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { AIProvider, AIOptions } from './ai-provider.interface'

interface KeyStatus {
    keyHash: string
    apiKey: string
    isBlocked: boolean
    blockedUntil: string | null
}

export class GroqProvider implements AIProvider {
    readonly providerName = 'groq'
    private keys: string[] = []

    constructor() {
        this.loadKeys()
    }

    private loadKeys() {
        const apiKey = process.env.GROQ_API_KEY

        if (!apiKey) {
            throw new Error('GROQ_API_KEY 환경변수가 설정되지 않았습니다')
        }

        this.keys = apiKey
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)

        if (this.keys.length === 0) {
            throw new Error('유효한 GROQ_API_KEY가 없습니다')
        }

        console.log(`[GroqProvider] ${this.keys.length}개 API 키 로드 완료`)
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
                .eq('provider', 'groq')
                .eq('key_hash', keyHash)
                .maybeSingle()

            if (error) {
                console.error(`[GroqProvider] 키 상태 조회 에러:`, error)
                continue
            }

            if (!data) {
                keyStatuses.push({
                    keyHash,
                    apiKey,
                    isBlocked: false,
                    blockedUntil: null,
                })
                continue
            }

            const isBlocked = data.is_blocked && data.blocked_until && data.blocked_until > now

            if (data.is_blocked && data.blocked_until && data.blocked_until <= now) {
                await supabaseAdmin
                    .from('ai_key_status')
                    .update({
                        is_blocked: false,
                        blocked_until: null,
                        fail_count: 0,
                        updated_at: now,
                    })
                    .eq('provider', 'groq')
                    .eq('key_hash', keyHash)

                console.log(`[GroqProvider] 키 복구: ...${keyHash}`)
            }

            keyStatuses.push({
                keyHash,
                apiKey,
                isBlocked: isBlocked,
                blockedUntil: data.blocked_until,
            })
        }

        const available = keyStatuses.find((k) => !k.isBlocked)

        if (!available) {
            const blockedKeys = keyStatuses.filter((k) => k.blockedUntil)
            if (blockedKeys.length > 0) {
                const minBlockedUntil = blockedKeys.reduce((min, k) => {
                    if (!k.blockedUntil) return min
                    return !min || k.blockedUntil < min ? k.blockedUntil : min
                }, null as string | null)

                if (minBlockedUntil) {
                    const waitMs = new Date(minBlockedUntil).getTime() - Date.now()
                    const waitSeconds = Math.ceil(waitMs / 1000)
                    console.error(
                        `[GroqProvider] 모든 키 차단됨. ${waitSeconds}초 후 재시도 가능`
                    )
                }
            }
            return null
        }

        return available
    }

    private async markKeyAsBlocked(
        keyHash: string,
        retryAfterSeconds?: number
    ): Promise<void> {
        const blockDuration = retryAfterSeconds ? retryAfterSeconds * 1000 : 5 * 60 * 1000

        const blockedUntil = new Date(Date.now() + blockDuration).toISOString()
        const now = new Date().toISOString()

        const { error } = await supabaseAdmin
            .from('ai_key_status')
            .upsert(
                {
                    provider: 'groq',
                    key_hash: keyHash,
                    is_blocked: true,
                    blocked_until: blockedUntil,
                    fail_count: 1,
                    updated_at: now,
                },
                {
                    onConflict: 'provider,key_hash',
                }
            )

        if (error) {
            console.error(`[GroqProvider] 키 차단 상태 저장 에러:`, error)
            return
        }

        console.warn(
            `[GroqProvider] Rate Limit - 키 차단: ...${keyHash} ` +
                `(${Math.floor(blockDuration / 1000)}초 후 재시도)`
        )
    }

    async complete(userPrompt: string, options?: AIOptions): Promise<string> {
        const model = options?.model ?? 'llama-3.1-8b-instant'
        const temperature = options?.temperature ?? 0.1
        const maxTokens = options?.maxTokens ?? 500
        const systemPrompt = options?.systemPrompt

        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const keyStatus = await this.getAvailableKey()

            if (!keyStatus) {
                throw new Error(
                    '모든 Groq API 키가 Rate Limit 상태입니다. 잠시 후 다시 시도해주세요.'
                )
            }

            if (attempt > 0) {
                console.log(
                    `[GroqProvider] ${attempt + 1}회 재시도 - 키: ...${keyStatus.keyHash}`
                )
            }

            try {
                const client = new Groq({ apiKey: keyStatus.apiKey })

                const messages: Array<{ role: 'system' | 'user'; content: string }> = []

                if (systemPrompt) {
                    messages.push({ role: 'system', content: systemPrompt })
                }

                messages.push({ role: 'user', content: userPrompt })

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                })

                const content = completion.choices?.[0]?.message?.content

                if (!content) {
                    throw new Error('Groq API 응답에 content가 없습니다')
                }

                return content.trim()
            } catch (error: any) {
                const isRateLimit =
                    error.status === 429 ||
                    error.code === 'rate_limit_exceeded' ||
                    error.message?.includes('rate limit')

                if (!isRateLimit) {
                    throw error
                }

                const retryAfter = error.headers?.['retry-after']
                    ? parseInt(error.headers['retry-after'], 10)
                    : undefined

                await this.markKeyAsBlocked(keyStatus.keyHash, retryAfter)

                if (attempt === maxRetries - 1) {
                    throw new Error(
                        `Groq API Rate Limit: ${maxRetries}회 재시도 실패`
                    )
                }

                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        throw new Error('Groq API 호출 실패: 최대 재시도 횟수 초과')
    }
}
