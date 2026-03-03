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
}

interface IncrementOptions {
    calls?: number       // 호출 횟수 (기본 1)
    successes?: number   // 성공 횟수
    failures?: number    // 실패 횟수
}

const NAVER_NEWS_DAILY_LIMIT = 25000
const PERPLEXITY_DAILY_LIMIT = 10000
const WARNING_THRESHOLD = 0.8

const API_LIMITS: Record<string, number> = {
    'naver_news': NAVER_NEWS_DAILY_LIMIT,
    'perplexity': PERPLEXITY_DAILY_LIMIT,
}

/**
 * incrementApiUsage - API 호출 횟수 증가
 *
 * 호출 1회당 call_count +1이 기준이다.
 * 성공/실패 횟수를 분리해서 기록하면 한도 경보 정확도가 올라간다.
 *
 * 예시:
 *   await incrementApiUsage('naver_news', { calls: 5, successes: 4, failures: 1 })
 */
export async function incrementApiUsage(
    apiName: string,
    options: IncrementOptions | number = 1
): Promise<ApiUsage> {
    const today = new Date().toISOString().split('T')[0]

    const { calls = 1, successes = 0, failures = 0 } =
        typeof options === 'number'
            ? { calls: options, successes: options, failures: 0 }
            : options

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
 * Perplexity API 예상 비용 계산
 * 
 * sonar 모델 기준:
 * - $5 per 1M input tokens
 * - $5 per 1M output tokens
 * 평균 요청당 약 500 input + 200 output tokens 가정
 */
export function calculatePerplexityCost(callCount: number): number {
    const avgInputTokens = 500
    const avgOutputTokens = 200
    const inputCostPer1M = 5
    const outputCostPer1M = 5
    
    const totalInputTokens = callCount * avgInputTokens
    const totalOutputTokens = callCount * avgOutputTokens
    
    const inputCost = (totalInputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (totalOutputTokens / 1_000_000) * outputCostPer1M
    
    return inputCost + outputCost
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
    const cost = calculatePerplexityCost(1)
    
    await incrementApiUsage('perplexity', {
        calls: 1,
        successes: success ? 1 : 0,
        failures: success ? 0 : 1,
    })
}

/**
 * 전체 API 비용 요약 조회
 */
export async function getAllApiCostsSummary() {
    try {
        const today = new Date().toISOString().split('T')[0]
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        const monthStart = startOfMonth.toISOString().split('T')[0]

        console.log('[getAllApiCostsSummary] 조회 기간:', { today, monthStart })

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

        let naverMonthly = 0
        let naverToday = 0
        let perplexityMonthly = 0
        let perplexityToday = 0

        for (const row of monthlyData || []) {
            const isToday = row.date === today
            
            if (row.api_name === 'naver_news') {
                naverMonthly += row.call_count
                if (isToday) naverToday += row.call_count
            } else if (row.api_name === 'perplexity') {
                const cost = calculatePerplexityCost(row.call_count)
                perplexityMonthly += cost
                if (isToday) perplexityToday += cost
            }
        }

        const result = {
            naver: {
                today: naverToday,
                monthly: naverMonthly,
                cost: calculateNaverCost(naverMonthly),
                limit: NAVER_NEWS_DAILY_LIMIT,
            },
            perplexity: {
                today: perplexityToday,
                monthly: perplexityMonthly,
            },
            total: {
                monthly: calculateNaverCost(naverMonthly) + perplexityMonthly,
            },
        }

        console.log('[getAllApiCostsSummary] 최종 결과:', result)
        return result
    } catch (error) {
        console.error('[getAllApiCostsSummary] 전체 에러:', error)
        throw error
    }
}
