/**
 * app/api/admin/api-usage/route.ts
 * 
 * [관리자 - API 사용량 조회]
 * 
 * 네이버 API 등 외부 API 사용량 통계를 조회합니다.
 */

import { NextResponse } from 'next/server'
import { getAllApiCostsSummary } from '@/lib/api-usage-tracker'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        console.log('[API Usage] 요청 시작')
        const summary = await getAllApiCostsSummary()
        console.log('[API Usage] 응답 데이터:', JSON.stringify(summary, null, 2))

        return NextResponse.json(summary)
    } catch (error) {
        console.error('[API Usage] 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: 'API 사용량 조회 실패' },
            { status: 500 }
        )
    }
}
