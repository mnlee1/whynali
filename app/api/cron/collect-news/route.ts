import { NextRequest, NextResponse } from 'next/server'
import { collectNaverNews } from '@/lib/collectors/naver-news'
import { incrementApiUsage, isWarningThreshold, getUsagePercentage } from '@/lib/api-usage-tracker'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const categories = ['연예', '스포츠', '정치', '사회', '기술']

        /* 카테고리별 성공/실패를 분리 추적하기 위해 allSettled 사용 */
        const settled = await Promise.allSettled(
            categories.map((cat) => collectNaverNews(cat))
        )

        const successes = settled.filter((r) => r.status === 'fulfilled').length
        const failures = settled.filter((r) => r.status === 'rejected').length
        const totalCollected = settled.reduce(
            (sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0),
            0
        )

        /* 호출 횟수(카테고리 수) 기준으로 사용량 집계 */
        await incrementApiUsage('naver_news', {
            calls:     categories.length,
            successes,
            failures,
        })

        // 80% 경고 확인
        const isWarning = await isWarningThreshold('naver_news')
        const usagePercentage = await getUsagePercentage('naver_news')

        if (isWarning) {
            console.warn(`⚠️  네이버 API 사용량 경고: ${usagePercentage.toFixed(1)}% (80% 초과)`)
        }

        return NextResponse.json({
            success: true,
            collected: totalCollected,
            byCategory: categories.reduce<Record<string, number | string>>((acc, cat, i) => {
                const result = settled[i]
                acc[cat] = result.status === 'fulfilled' ? result.value : `error: ${(result.reason as Error)?.message ?? 'unknown'}`
                return acc
            }, {}),
            apiUsage: {
                calls: categories.length,
                successes,
                failures,
                percentage: usagePercentage,
                warning: isWarning,
            },
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('뉴스 수집 Cron 에러:', error)
        return NextResponse.json(
            { error: 'COLLECTION_ERROR', message: '뉴스 수집 실패' },
            { status: 500 }
        )
    }
}
