/**
 * lib/api-usage-tracker.ts
 *
 * API 사용량 추적 유틸리티
 *
 * 네이버 API 등 외부 API의 사용량을 추적하고 한도를 관리한다.
 * call_count: 실제 호출 횟수 기준 (저장 건수 아님)
 * success_count / fail_count: 성공/실패 호출 수 분리 기록
 * (migration: add_api_usage_success_fail_count.sql)
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
const PERPLEXITY_DAILY_LIMIT = 10000
const WARNING_THRESHOLD = 0.8

const API_LIMITS: Record<string, number> = {
    'naver_news': NAVER_NEWS_DAILY_LIMIT,
    'perplexity': PERPLEXITY_DAILY_LIMIT,
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
 *   await incrementApiUsage('perplexity', { calls: 1, successes: 1, failures: 0, inputTokens: 500, outputTokens: 200 })
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
 * Perplexity API 예상 비용 계산 (토큰 기반)
 * 
 * sonar 모델 기준:
 * - $5 per 1M input tokens
 * - $5 per 1M output tokens
 */
export function calculatePerplexityCost(inputTokens: number, outputTokens: number): number {
    const inputCostPer1M = 5
    const outputCostPer1M = 5
    
    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M
    
    return inputCost + outputCost
}

/**
 * Perplexity API 예상 비용 계산 (호출 횟수 기반, 하위 호환)
 */
export function calculatePerplexityCostByCallCount(callCount: number): number {
    const avgInputTokens = 500
    const avgOutputTokens = 200
    return calculatePerplexityCost(callCount * avgInputTokens, callCount * avgOutputTokens)
}

/**
 * 네이버 API 비용 (무료 한도 내 사용, 초과 시 차단)
 */
export function calculateNaverCost(callCount: number): number {
    return 0
}

/**
 * Perplexity API 사용량 추적
 */
export async function trackPerplexityUsage(
    endpoint: string,
    inputTokens: number,
    outputTokens: number,
    success: boolean
): Promise<void> {
    await incrementApiUsage('perplexity', {
        calls: 1,
        successes: success ? 1 : 0,
        failures: success ? 0 : 1,
        inputTokens,
        outputTokens,
    })
}

/**
 * 전체 API 비용 요약 조회
 */
export async function getAllApiCostsSummary() {
    try {
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        const monthStart = startOfMonth.toISOString().split('T')[0]

        console.log('[getAllApiCostsSummary] 조회 기간:', { today, yesterday, monthStart })

        const { data: monthlyData, error } = await supabaseAdmin
            .from('api_usage')
            .select('*')
            .gte('date', monthStart)
            .order('date', { ascending: true })

        if (error) {
            console.error('[getAllApiCostsSummary] DB 에러:', error)
            throw error
        }

        console.log('[getAllApiCostsSummary] 조회 결과:', monthlyData?.length ?? 0, '건')

        let naverCallsMonthly = 0
        let naverCallsToday = 0
        let groqCallsMonthly = 0
        let groqCallsToday = 0
        let groqSuccesses = 0
        let groqFailures = 0
        let perplexityInputTokensMonthly = 0
        let perplexityOutputTokensMonthly = 0
        let perplexityInputTokensToday = 0
        let perplexityOutputTokensToday = 0
        let perplexityCallsMonthly = 0
        let perplexityCallsToday = 0
        let perplexitySuccesses = 0
        let perplexityFailures = 0

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
            } else if (row.api_name === 'perplexity') {
                perplexityInputTokensMonthly += row.input_tokens || 0
                perplexityOutputTokensMonthly += row.output_tokens || 0
                perplexityCallsMonthly += row.call_count
                perplexitySuccesses += row.success_count || 0
                perplexityFailures += row.fail_count || 0
                if (isToday) {
                    perplexityInputTokensToday += row.input_tokens || 0
                    perplexityOutputTokensToday += row.output_tokens || 0
                    perplexityCallsToday += row.call_count
                }
            }
        }

        const perplexityCostMonthly = calculatePerplexityCost(
            perplexityInputTokensMonthly,
            perplexityOutputTokensMonthly
        )
        const perplexityCostToday = calculatePerplexityCost(
            perplexityInputTokensToday,
            perplexityOutputTokensToday
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
            },
            // 오늘 호출이 있을 때만 표시 (실제 사용 중일 때만)
            perplexity: perplexityCallsToday > 0 ? {
                today: perplexityCostToday,
                monthly: perplexityCostMonthly,
                calls: {
                    today: perplexityCallsToday,
                    monthly: perplexityCallsMonthly,
                },
                tokens: {
                    today: {
                        input: perplexityInputTokensToday,
                        output: perplexityOutputTokensToday,
                        total: perplexityInputTokensToday + perplexityOutputTokensToday,
                    },
                    monthly: {
                        input: perplexityInputTokensMonthly,
                        output: perplexityOutputTokensMonthly,
                        total: perplexityInputTokensMonthly + perplexityOutputTokensMonthly,
                    },
                },
                successes: perplexitySuccesses,
                failures: perplexityFailures,
            } : null,
            total: {
                monthly: perplexityCostMonthly, // Groq는 무료
            },
        }

        console.log('[getAllApiCostsSummary] 최종 결과:', result)
        return result
    } catch (error) {
        console.error('[getAllApiCostsSummary] 전체 에러:', error)
        throw error
    }
}
