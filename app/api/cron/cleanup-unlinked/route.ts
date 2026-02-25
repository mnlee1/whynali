/**
 * app/api/cron/cleanup-unlinked/route.ts
 *
 * [미연결 수집 데이터 정리 Cron]
 *
 * 주 1회 실행되며 이슈에 연결되지 않은 채 보존 기간(기본 7일)이 지난
 * news_data, community_data를 삭제해 DB 용량을 관리한다.
 *
 * GitHub Actions에서 호출: .github/workflows/cron-cleanup-unlinked.yml
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupUnlinkedData } from '@/lib/cleanup/unlinked-cleanup'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const result = await cleanupUnlinkedData()
        const elapsed = Date.now() - startTime

        return NextResponse.json({
            success: true,
            deletedNews: result.deletedNews,
            deletedCommunity: result.deletedCommunity,
            retainDays: result.retainDays,
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('미연결 데이터 정리 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'CLEANUP_ERROR',
                message: '미연결 데이터 정리 실패',
            },
            { status: 500 }
        )
    }
}
