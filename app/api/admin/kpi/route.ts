/**
 * app/api/admin/kpi/route.ts
 * 
 * [KPI 데이터 API]
 * 
 * 관리자 전용. 월별 KPI 지표와 주차별 진행 상황을 반환합니다.
 * Query Parameters:
 * - year: 조회할 연도 (기본값: 현재 연도)
 * - month: 조회할 월 (기본값: 현재 월)
 */

import { NextRequest, NextResponse } from 'next/server'
import { calculateKPI } from '@/lib/kpi/calculator'

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined
        const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined

        // KPI 계산
        const result = await calculateKPI(year, month)

        return NextResponse.json({
            ...result,
            generatedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('[API /admin/kpi] 에러:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
