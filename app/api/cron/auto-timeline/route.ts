/**
 * app/api/cron/auto-timeline/route.ts
 *
 * [타임라인 자동 생성 Cron]
 *
 * 승인된 이슈 중 타임라인 포인트가 없는 이슈에
 * 연결된 뉴스 데이터를 기반으로 자동 생성합니다.
 * 이미 포인트가 있는 이슈는 건너뜁니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateTimelines } from '@/lib/timeline/auto-timeline'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const results = await generateTimelines()
        const elapsed = Date.now() - startTime

        const totalPoints = results.reduce((sum, r) => sum + r.pointsCreated, 0)

        return NextResponse.json({
            success: true,
            issuesProcessed: results.length,
            totalPointsCreated: totalPoints,
            details: results,
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('타임라인 자동 생성 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'AUTO_TIMELINE_ERROR',
                message: '타임라인 자동 생성 실패',
            },
            { status: 500 }
        )
    }
}
