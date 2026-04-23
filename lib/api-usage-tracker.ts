/**
 * lib/api-usage-tracker.ts
 *
 * API 사용량 추적 유틸리티
 *
 * 네이버 API 등 외부 API의 사용량을 추적하고 한도를 관리한다.
 * call_count: 실제 호출 횟수 기준 (저장 건수 아님)
 * success_count / fail_count: 성공/실패 호출 수 분리 기록
 * (migration: add_api_usage_success_fail_count.sql)
 *
 * Claude 선불 크레딧 충전 주기 추적:
 * claude_credit_cycles 테이블에 충전 이력을 기록하고,
 * 현재 활성 충전 주기 기준으로 사용액/잔액/소진 예상일을 계산한다.
 * (migration: add_claude_credit_cycles.sql)
 */

import { supabaseAdmin } from './supabase/server'

interface ApiUsage {
    api_name: string
    date: string
    call_count: number
    success_count: number
    fail_count: number
    daily_limit: number
    input_tokens: number
    output_tokens: number
    total_tokens: number
}

interface IncrementOptions {
    calls?: number          // 호출 횟수 (기본 1)
    successes?: number      // 성공 횟수
    failures?: number       // 실패 횟수
    inputTokens?: number    // 입력 토큰 수
    outputTokens?: number   // 출력 토큰 수
}

const NAVER_NEWS_DAILY_LIMIT = 25000
const WARNING_THRESHOLD = 0.8

const API_LIMITS: Record<string, number> = {
    'naver_news': NAVER_NEWS_DAILY_LIMIT,
}

/**
 * incrementApiUsage - API 호출 횟수 및 토큰 사용량 증가
 *
 * 호출 1회당 call_count +1이 기준이다.
 * 성공/실패 횟수를 분리해서 기록하면 한도 경보 정확도가 올라간다.
 * Perplexity 등 토큰 기반 API는 inputTokens, outputTokens 정보도 함께 기록한다.
 *
 * 예시:
 *   await incrementApiUsage('naver_news', { calls: 5, successes: 4, failures: 1 })
 *   await incrementApiUsage('claude', { calls: 1, successes: 1, failures: 0, inputTokens: 500, outputTokens: 200 })
 */
export async function incrementApiUsage(
    apiName: string,
    options: IncrementOptions | number = 1
): Promise<ApiUsage> {
    const today = new Date().toISOString().split('T')[0]

    const { calls = 1, successes = 0, failures = 0, inputTokens = 0, outputTokens = 0 } =
        typeof options === 'number'
            ? { calls: options, successes: options, failures: 0, inputTokens: 0, outputTokens: 0 }
            : options

    const totalTokens = inputTokens + outputTokens

    const { data: existing, error: fetchError } = await supabaseAdmin
        .from('api_usage')
        .select('*')
        .eq('api_name', apiName)
        .eq('date', today)
        .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError
    }

    if (existing) {
        const { data, error } = await supabaseAdmin
            .from('api_usage')
            .update({
                call_count:    existing.call_count    + calls,
                success_count: existing.success_count + successes,
                fail_count:    existing.fail_count    + failures,
                input_tokens:  existing.input_tokens  + inputTokens,
                output_tokens: existing.output_tokens + outputTokens,
                total_tokens:  existing.total_tokens  + totalTokens,
                updated_at:    new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single()

        if (error) throw error
        return data
    } else {
        const { data, error } = await supabaseAdmin
            .from('api_usage')
            .insert({
                api_name:      apiName,
                date:          today,
                call_count:    calls,
                success_count: successes,
                fail_count:    failures,
                input_tokens:  inputTokens,
                output_tokens: outputTokens,
                total_tokens:  totalTokens,
                daily_limit:   API_LIMITS[apiName] ?? 10000,
            })
            .select()
            .single()

        if (error) throw error
        return data
    }
}

/**
 * 오늘의 API 사용량 조회
 */
export async function getTodayUsage(apiName: string): Promise<ApiUsage | null> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabaseAdmin
        .from('api_usage')
        .select('*')
        .eq('api_name', apiName)
        .eq('date', today)
        .single()

    if (error && error.code !== 'PGRST116') {
        throw error
    }

    return data
}

/**
 * 한도 초과 여부 확인
 */
export async function isOverLimit(apiName: string): Promise<boolean> {
    const usage = await getTodayUsage(apiName)
    if (!usage) return false

    return usage.call_count >= usage.daily_limit
}

/**
 * 경고 임계값(80%) 초과 여부 확인
 */
export async function isWarningThreshold(apiName: string): Promise<boolean> {
    const usage = await getTodayUsage(apiName)
    if (!usage) return false

    const percentage = usage.call_count / usage.daily_limit
    return percentage >= WARNING_THRESHOLD
}

/**
 * 사용률 계산
 */
export async function getUsagePercentage(apiName: string): Promise<number> {
    const usage = await getTodayUsage(apiName)
    if (!usage || usage.daily_limit === 0) return 0

    return (usage.call_count / usage.daily_limit) * 100
}

/**
 * API 사용 통계 조회
 */
export async function getUsageStats(apiName: string, days: number = 7) {
    const { data, error } = await supabaseAdmin
        .from('api_usage')
        .select('*')
        .eq('api_name', apiName)
        .order('date', { ascending: false })
        .limit(days)

    if (error) throw error

    return data
}

/**
 * Claude API 예상 비용 계산 (토큰 기반)
 *
 * claude-sonnet-4-6 기준 (기본값):
 * - $3 per 1M input tokens
 * - $15 per 1M output tokens
 */
export function calculateClaudeCost(inputTokens: number, outputTokens: number): number {
    const inputCostPer1M = 3
    const outputCostPer1M = 15

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M

    return inputCost + outputCost
}

/**
 * 네이버 API 비용 (무료 한도 내 사용, 초과 시 차단)
 */
export function calculateNaverCost(callCount: number): number {
    return 0
}

/**
 * 활성 충전 주기 기간의 Claude 사용량 집계
 *
 * claude_credit_cycles에서 현재 활성 충전건을 조회하고,
 * 충전일 이후의 api_usage를 합산해 사용액/잔액/소진 예상일을 반환한다.
 *
 * 테이블 미생성(마이그레이션 미적용) 또는 충전 이력 없음이면 null을 반환한다.
 */
async function getClaudeCreditCycleSummary() {
    try {
    const { data: activeCycle, error: cycleError } = await supabaseAdmin
        .from('claude_credit_cycles')
        .select('*')
        .eq('is_active', true)
        .single()

    // 테이블 미존재(PGRST116 외 에러) 또는 행 없음 모두 null 반환
    if (cycleError || !activeCycle) return null

    const today = new Date().toISOString().split('T')[0]
    const chargedAt = activeCycle.charged_at

    const { data: cycleData } = await supabaseAdmin
        .from('api_usage')
        .select('*')
        .eq('api_name', 'claude')
        .gte('date', chargedAt)
        .order('date', { ascending: true })

    let inputTokens = 0
    let outputTokens = 0
    let calls = 0
    let inputTokensToday = 0
    let outputTokensToday = 0

    for (const row of cycleData || []) {
        inputTokens += row.input_tokens || 0
        outputTokens += row.output_tokens || 0
        calls += row.call_count || 0
        if (row.date === today) {
            inputTokensToday += row.input_tokens || 0
            outputTokensToday += row.output_tokens || 0
        }
    }

    const usedUsd = calculateClaudeCost(inputTokens, outputTokens)
    const amountUsd = Number(activeCycle.amount_usd)
    const remainingUsd = Math.max(0, amountUsd - usedUsd)
    const usedPercent = amountUsd > 0 ? Math.min(100, (usedUsd / amountUsd) * 100) : 0

    // 충전일부터 오늘까지 경과 일수 (최소 1)
    const chargedDate = new Date(chargedAt)
    const todayDate = new Date(today)
    const elapsedDays = Math.max(
        1,
        Math.floor((todayDate.getTime() - chargedDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    )
    const dailyAvgUsd = usedUsd / elapsedDays

    // 잔액 소진 예상일 (일평균 > 0일 때만)
    let estimatedDepletionDate: string | null = null
    if (dailyAvgUsd > 0 && remainingUsd > 0) {
        const daysLeft = Math.ceil(remainingUsd / dailyAvgUsd)
        const depletionDate = new Date(todayDate)
        depletionDate.setDate(depletionDate.getDate() + daysLeft)
        estimatedDepletionDate = depletionDate.toISOString().split('T')[0]
    }

    return {
        id: activeCycle.id as string,
        chargedAt: chargedAt as string,
        amountUsd,
        usedUsd,
        remainingUsd,
        usedPercent,
        elapsedDays,
        dailyAvgUsd,
        estimatedDepletionDate,
        memo: (activeCycle.memo ?? null) as string | null,
        calls,
        tokens: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
        },
        todayCost: calculateClaudeCost(inputTokensToday, outputTokensToday),
    }
    } catch (err) {
        // 테이블 미생성 등 예외 상황에서도 메인 집계가 실패하지 않도록 null 반환
        console.warn('[getClaudeCreditCycleSummary] 충전 주기 조회 실패 (마이그레이션 미적용?):', err)
        return null
    }
}

/**
 * AI 키 차단 상태 조회 (Rate Limit 감지용)
 */
async function getAiKeyStatus(provider: 'claude' | 'groq') {
    try {
        const { data, error } = await supabaseAdmin
            .from('ai_key_status')
            .select('is_blocked, blocked_until, fail_count, block_reason, updated_at')
            .eq('provider', provider)
            .eq('is_blocked', true)
            .limit(1)
            .maybeSingle()

        if (error || !data) return null

        // rate_limit: 차단 시간이 지났으면 null 반환
        if (data.block_reason !== 'credit_depleted' && data.blocked_until && new Date(data.blocked_until) <= new Date()) return null

        return {
            isBlocked: true,
            blockedUntil: data.blocked_until as string | null,
            failCount: data.fail_count as number,
            blockReason: (data.block_reason ?? 'rate_limit') as 'rate_limit' | 'credit_depleted',
        }
    } catch {
        return null
    }
}

/**
 * 전체 API 비용 요약 조회
 *
 * 달력 월 기준 통계 + 현재 충전 주기 기준 통계를 함께 반환한다.
 */
export async function getAllApiCostsSummary() {
    try {
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        const monthStart = startOfMonth.toISOString().split('T')[0]

        console.log('[getAllApiCostsSummary] 조회 기간:', { today, yesterday, monthStart })

        const [monthlyResult, creditCycle, claudeKeyStatus, groqKeyStatus] = await Promise.all([
            supabaseAdmin
                .from('api_usage')
                .select('*')
                .gte('date', monthStart)
                .order('date', { ascending: true }),
            getClaudeCreditCycleSummary(),
            getAiKeyStatus('claude'),
            getAiKeyStatus('groq'),
        ])

        if (monthlyResult.error) {
            console.error('[getAllApiCostsSummary] DB 에러:', monthlyResult.error)
            throw monthlyResult.error
        }

        const monthlyData = monthlyResult.data
        console.log('[getAllApiCostsSummary] 조회 결과:', monthlyData?.length ?? 0, '건')

        let naverCallsMonthly = 0
        let naverCallsToday = 0
        let groqCallsMonthly = 0
        let groqCallsToday = 0
        let groqSuccesses = 0
        let groqFailures = 0
        let claudeInputTokensMonthly = 0
        let claudeOutputTokensMonthly = 0
        let claudeInputTokensToday = 0
        let claudeOutputTokensToday = 0
        let claudeCallsMonthly = 0
        let claudeCallsToday = 0
        let claudeSuccesses = 0
        let claudeFailures = 0

        for (const row of monthlyData || []) {
            const isToday = row.date === today

            if (row.api_name === 'naver_news') {
                naverCallsMonthly += row.call_count
                if (isToday) naverCallsToday += row.call_count
            } else if (row.api_name === 'groq') {
                groqCallsMonthly += row.call_count
                groqSuccesses += row.success_count || 0
                groqFailures += row.fail_count || 0
                if (isToday) groqCallsToday += row.call_count
            } else if (row.api_name === 'claude') {
                claudeInputTokensMonthly += row.input_tokens || 0
                claudeOutputTokensMonthly += row.output_tokens || 0
                claudeCallsMonthly += row.call_count
                claudeSuccesses += row.success_count || 0
                claudeFailures += row.fail_count || 0
                if (isToday) {
                    claudeInputTokensToday += row.input_tokens || 0
                    claudeOutputTokensToday += row.output_tokens || 0
                    claudeCallsToday += row.call_count
                }
            }
        }

        const claudeCostMonthly = calculateClaudeCost(
            claudeInputTokensMonthly,
            claudeOutputTokensMonthly
        )
        const claudeCostToday = calculateClaudeCost(
            claudeInputTokensToday,
            claudeOutputTokensToday
        )

        const result = {
            naver: {
                today: naverCallsToday,
                monthly: naverCallsMonthly,
                cost: calculateNaverCost(naverCallsMonthly),
                limit: NAVER_NEWS_DAILY_LIMIT,
            },
            groq: {
                today: groqCallsToday,
                monthly: groqCallsMonthly,
                successes: groqSuccesses,
                failures: groqFailures,
                keyStatus: groqKeyStatus,
            },
            claude: {
                today: claudeCostToday,
                monthly: claudeCostMonthly,
                calls: {
                    today: claudeCallsToday,
                    monthly: claudeCallsMonthly,
                },
                tokens: {
                    today: {
                        input: claudeInputTokensToday,
                        output: claudeOutputTokensToday,
                        total: claudeInputTokensToday + claudeOutputTokensToday,
                    },
                    monthly: {
                        input: claudeInputTokensMonthly,
                        output: claudeOutputTokensMonthly,
                        total: claudeInputTokensMonthly + claudeOutputTokensMonthly,
                    },
                },
                successes: claudeSuccesses,
                failures: claudeFailures,
                // 충전 주기별 현황 (충전 이력이 있을 때만)
                creditCycle: creditCycle ?? null,
                // 현재 키 차단 상태 (Rate Limit 감지용)
                keyStatus: claudeKeyStatus,
            },
            total: {
                monthly: claudeCostMonthly, // Groq는 무료
            },
        }

        console.log('[getAllApiCostsSummary] 최종 결과:', result)
        return result
    } catch (error) {
        console.error('[getAllApiCostsSummary] 전체 에러:', error)
        throw error
    }
}
