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
 * - 차단되지 않은 키 중 무작위로 선택해 호출 — 항상 같은 키(1번)만 몰빵되는 걸 방지
 * - 429 에러 발생 시 해당 키만 차단, 나머지 키로 계속 진행
 * - blocked_until 지난 키는 자동 복구
 */

import Groq from 'groq-sdk'
import { supabaseAdmin } from '@/lib/supabase-server'
import { incrementApiUsage } from '@/lib/api-usage-tracker'
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

    private async getAvailableKey(): Promise<{ key: KeyStatus | null; waitMs: number | null }> {
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

        // 차단 안 된 키 중 무작위 선택 — 고정 순서로 첫 키만 몰빵되는 걸 방지해 부하를 분산시킨다
        const availableKeys = keyStatuses.filter((k) => !k.isBlocked)
        const available = availableKeys.length > 0
            ? availableKeys[Math.floor(Math.random() * availableKeys.length)]
            : undefined

        if (!available) {
            const blockedKeys = keyStatuses.filter((k) => k.blockedUntil)
            let waitMs: number | null = null

            if (blockedKeys.length > 0) {
                const minBlockedUntil = blockedKeys.reduce((min, k) => {
                    if (!k.blockedUntil) return min
                    return !min || k.blockedUntil < min ? k.blockedUntil : min
                }, null as string | null)

                if (minBlockedUntil) {
                    waitMs = new Date(minBlockedUntil).getTime() - Date.now()
                    console.error(
                        `[GroqProvider] 모든 키 차단됨. ${Math.ceil(waitMs / 1000)}초 후 재시도 가능`
                    )
                }
            }
            return { key: null, waitMs }
        }

        return { key: available, waitMs: null }
    }

    private async markKeyAsBlocked(
        keyHash: string,
        retryAfterSeconds?: number
    ): Promise<void> {
        // retry-after 헤더가 없으면 60초로 차단 — Groq RPM 윈도우는 60초면 풀리므로
        // 기존 5분 고정 차단은 필요 이상으로 키를 오래 묶어두는 문제가 있었음
        const blockDuration = retryAfterSeconds ? retryAfterSeconds * 1000 : 60 * 1000

        const blockedUntil = new Date(Date.now() + blockDuration).toISOString()
        const now = new Date().toISOString()

        // 기존 fail_count 조회 후 누적 (upsert는 항상 1로 리셋하므로 별도 처리)
        const { data: existing } = await supabaseAdmin
            .from('ai_key_status')
            .select('fail_count')
            .eq('provider', 'groq')
            .eq('key_hash', keyHash)
            .maybeSingle()

        const nextFailCount = (existing?.fail_count ?? 0) + 1

        const { error } = await supabaseAdmin
            .from('ai_key_status')
            .upsert(
                {
                    provider: 'groq',
                    key_hash: keyHash,
                    is_blocked: true,
                    blocked_until: blockedUntil,
                    fail_count: nextFailCount,
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
        const model = options?.model ?? 'qwen/qwen3.6-27b'
        const temperature = options?.temperature ?? 0.1
        const maxTokens = options?.maxTokens ?? 500
        const systemPrompt = options?.systemPrompt

        const maxRetries = 3
        const WAIT_CAP_MS = 10000

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const { key: keyStatus, waitMs } = await this.getAvailableKey()

            if (!keyStatus) {
                if (waitMs !== null && waitMs > 0 && waitMs <= WAIT_CAP_MS && attempt < maxRetries - 1) {
                    console.log(
                        `[GroqProvider] 모든 키 차단 - ${Math.ceil(waitMs / 1000)}초 대기 후 재시도`
                    )
                    await new Promise((resolve) => setTimeout(resolve, waitMs + 500))
                    continue
                }
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

                // reasoning 모델(openai/gpt-oss-*)은 system 메시지 미지원 → user 메시지에 합침
                // + temperature 파라미터 미지원 (harmony 포맷 고유 제약, qwen에는 해당 안 됨)
                const isReasoningModel = model.startsWith('openai/gpt-oss')
                // thinking 모델(gpt-oss, qwen3 계열)은 <think> 내부 추론이 max_tokens를 소모함
                // → 응답이 잘리지 않도록 토큰 여유 확보 + reasoning 필드 분리가 공통으로 필요
                const isThinkingModel = isReasoningModel || model.startsWith('qwen/')
                const messages: Array<{ role: 'system' | 'user'; content: string }> = []

                if (systemPrompt && !isReasoningModel) {
                    messages.push({ role: 'system', content: systemPrompt })
                }

                const finalUserPrompt =
                    systemPrompt && isReasoningModel
                        ? `${systemPrompt}\n\n${userPrompt}`
                        : userPrompt

                messages.push({ role: 'user', content: finalUserPrompt })

                // thinking 모델은 내부 추론 토큰도 max_tokens를 소모하므로 여유 확보
                const effectiveMaxTokens = isThinkingModel
                    ? Math.max(maxTokens, 4000)
                    : maxTokens

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    // reasoning 모델은 temperature 파라미터를 지원하지 않음
                    ...(isReasoningModel ? {} : { temperature }),
                    max_tokens: effectiveMaxTokens,
                    ...(isThinkingModel ? { include_reasoning: false } : {}),
                    ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
                })

                const message = completion.choices?.[0]?.message
                // reasoning 모델에서 content가 null인 경우 reasoning 필드로 fallback
                const content = message?.content || (message as any)?.reasoning || null

                if (!content) {
                    // reasoning 모델의 경우 content가 간헐적으로 null 반환 → 재시도
                    if (attempt < maxRetries - 1) {
                        console.warn(
                            `[GroqProvider] content null (시도 ${attempt + 1}/${maxRetries}) - 재시도`
                        )
                        await new Promise((resolve) => setTimeout(resolve, 1000))
                        continue
                    }
                    throw new Error('Groq API 응답에 content가 없습니다')
                }

                // 사용량 추적 (fire-and-forget)
                incrementApiUsage('groq', {
                    calls: 1,
                    successes: 1,
                }).catch(() => {})

                return content.trim()
            } catch (error: any) {
                const isRateLimit =
                    error.status === 429 ||
                    error.code === 'rate_limit_exceeded' ||
                    error.message?.includes('rate limit')

                if (!isRateLimit) {
                    // 사용량 추적 (실패)
                    incrementApiUsage('groq', { calls: 1, failures: 1 }).catch(() => {})
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
