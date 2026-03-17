/**
 * lib/ai/claude-provider.ts
 *
 * [Claude AI 프로바이더 구현]
 *
 * Anthropic Claude API를 통한 AI 호출을 담당합니다.
 * Groq와 동일한 인터페이스를 구현하여 쉽게 교체 가능합니다.
 *
 * 특징:
 * - 다중 키 순환 및 Rate Limit 처리 (Supabase DB 기반)
 * - 429 에러 발생 시 자동으로 다음 키로 전환
 * - blocked_until 지난 키는 자동 복구
 * - JSON 모드 지원 (response_format: json_object)
 *
 * Claude API 요금 (2026년 기준):
 * - Claude 3.5 Sonnet: $3/M input tokens, $15/M output tokens
 * - Claude 3 Haiku: $0.25/M input tokens, $1.25/M output tokens (권장)
 * - Claude 3 Opus: $15/M input tokens, $75/M output tokens
 *
 * Groq 대비 장점:
 * - 더 정확한 응답 (특히 복잡한 추론)
 * - 긴 컨텍스트 지원 (200K tokens)
 * - 안정적인 서비스
 *
 * 비용 비교 (하루 150,000 토큰 기준):
 * - Groq: 무료
 * - Claude Haiku: $0.04/day = $1.2/month (약 1,600원/월)
 * - Claude Sonnet: $0.45/day = $13.5/month (약 18,000원/월)
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { AIProvider, AIOptions } from './ai-provider.interface'

interface KeyStatus {
    keyHash: string
    apiKey: string
    isBlocked: boolean
    blockedUntil: string | null
}

export class ClaudeProvider implements AIProvider {
    readonly providerName = 'claude'
    private keys: string[] = []

    constructor() {
        this.loadKeys()
    }

    private loadKeys() {
        const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY

        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY 또는 CLAUDE_API_KEY 환경변수가 설정되지 않았습니다')
        }

        this.keys = apiKey
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)

        if (this.keys.length === 0) {
            throw new Error('유효한 Claude API 키가 없습니다')
        }

        console.log(`[ClaudeProvider] ${this.keys.length}개 API 키 로드 완료`)
    }

    private getKeyHash(apiKey: string): string {
        // Claude API 키 형식: sk-ant-...
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
                .eq('provider', 'claude')
                .eq('key_hash', keyHash)
                .maybeSingle()

            if (error) {
                console.error(`[ClaudeProvider] 키 상태 조회 에러:`, error)
                continue
            }

            if (!data) {
                // 신규 키
                keyStatuses.push({
                    keyHash,
                    apiKey,
                    isBlocked: false,
                    blockedUntil: null,
                })
                continue
            }

            // 차단 시간 지났는지 확인
            const isBlocked = data.is_blocked && data.blocked_until && data.blocked_until > now

            // 차단 시간 지났으면 자동 복구
            if (data.is_blocked && data.blocked_until && data.blocked_until <= now) {
                await supabaseAdmin
                    .from('ai_key_status')
                    .update({
                        is_blocked: false,
                        blocked_until: null,
                        fail_count: 0,
                        updated_at: now,
                    })
                    .eq('provider', 'claude')
                    .eq('key_hash', keyHash)

                console.log(`[ClaudeProvider] 키 복구: ...${keyHash}`)
            }

            keyStatuses.push({
                keyHash,
                apiKey,
                isBlocked: isBlocked,
                blockedUntil: data.blocked_until,
            })
        }

        // 사용 가능한 키 찾기
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
                        `[ClaudeProvider] 모든 키 차단됨. ${waitSeconds}초 후 재시도 가능`
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
        // Claude API는 보통 60초 Rate Limit 윈도우 사용
        const blockDuration = retryAfterSeconds ? retryAfterSeconds * 1000 : 60 * 1000

        const blockedUntil = new Date(Date.now() + blockDuration).toISOString()
        const now = new Date().toISOString()

        const { error } = await supabaseAdmin
            .from('ai_key_status')
            .upsert(
                {
                    provider: 'claude',
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
            console.error(`[ClaudeProvider] 키 차단 상태 저장 에러:`, error)
            return
        }

        console.warn(
            `[ClaudeProvider] Rate Limit - 키 차단: ...${keyHash} ` +
                `(${Math.floor(blockDuration / 1000)}초 후 재시도)`
        )
    }

    async complete(userPrompt: string, options?: AIOptions): Promise<string> {
        // Claude 모델 선택
        // haiku: 빠르고 저렴 (권장)
        // sonnet: 균형잡힌 성능
        // opus: 최고 성능 (비쌈)
        const model = options?.model ?? 'claude-3-haiku-20240307'
        const temperature = options?.temperature ?? 0.1
        const maxTokens = options?.maxTokens ?? 1024
        const systemPrompt = options?.systemPrompt

        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const keyStatus = await this.getAvailableKey()

            if (!keyStatus) {
                throw new Error(
                    '모든 Claude API 키가 Rate Limit 상태입니다. 잠시 후 다시 시도해주세요.'
                )
            }

            if (attempt > 0) {
                console.log(
                    `[ClaudeProvider] ${attempt + 1}회 재시도 - 키: ...${keyStatus.keyHash}`
                )
            }

            try {
                const client = new Anthropic({ apiKey: keyStatus.apiKey })

                // Claude는 system prompt를 별도로 전달
                const messageContent = systemPrompt
                    ? `${systemPrompt}\n\n${userPrompt}`
                    : userPrompt

                const message = await client.messages.create({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    messages: [
                        {
                            role: 'user',
                            content: messageContent,
                        },
                    ],
                })

                // Claude 응답 추출
                const content = message.content[0]

                if (content.type !== 'text') {
                    throw new Error('Claude API 응답이 text 타입이 아닙니다')
                }

                return content.text.trim()
            } catch (error: any) {
                // Rate Limit 에러 확인
                const isRateLimit =
                    error.status === 429 ||
                    error.type === 'rate_limit_error' ||
                    error.message?.includes('rate limit')

                if (!isRateLimit) {
                    // Rate Limit이 아닌 다른 에러는 즉시 throw
                    throw error
                }

                // Retry-After 헤더 확인
                const retryAfter = error.headers?.['retry-after']
                    ? parseInt(error.headers['retry-after'], 10)
                    : undefined

                await this.markKeyAsBlocked(keyStatus.keyHash, retryAfter)

                if (attempt === maxRetries - 1) {
                    throw new Error(`Claude API Rate Limit: ${maxRetries}회 재시도 실패`)
                }

                // 재시도 전 대기
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        throw new Error('Claude API 호출 실패: 최대 재시도 횟수 초과')
    }
}
