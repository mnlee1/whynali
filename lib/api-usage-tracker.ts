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
const WARNING_THRESHOLD = 0.8

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
                daily_limit:   apiName === 'naver_news' ? NAVER_NEWS_DAILY_LIMIT : 10000,
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
