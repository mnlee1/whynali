/**
 * app/api/admin/api-usage/route.ts
 * 
 * [관리자 - API 사용량 조회]
 * 
 * 네이버 API 등 외부 API 사용량 통계를 조회합니다.
 */

import { NextResponse } from 'next/server'
import { getTodayUsage, getUsageStats, getUsagePercentage } from '@/lib/api-usage-tracker'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const apiName = 'naver_news'

        const todayUsage = await getTodayUsage(apiName)
        const usagePercentage = await getUsagePercentage(apiName)
        const recentStats = await getUsageStats(apiName, 7)

        return NextResponse.json({
            today: todayUsage,
            percentage: usagePercentage,
            warning: usagePercentage >= 80,
            history: recentStats,
        })
    } catch (error) {
        console.error('API 사용량 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: 'API 사용량 조회 실패' },
            { status: 500 }
        )
    }
}
