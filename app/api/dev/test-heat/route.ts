/**
 * app/api/dev/test-heat/route.ts
 * 
 * [개발용 - 화력 분석 테스트 API]
 * 
 * 특정 이슈의 화력 지수를 계산하고 업데이트합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { recalculateHeatForIssue } from '@/lib/analysis/heat'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    try {
        const { issueId } = await request.json()

        if (!issueId) {
            return NextResponse.json(
                { error: 'issueId required' },
                { status: 400 }
            )
        }

        const heatIndex = await recalculateHeatForIssue(issueId)

        return NextResponse.json({
            ok: true,
            issueId,
            heatIndex,
        })
    } catch (error) {
        console.error('화력 분석 테스트 에러:', error)
        return NextResponse.json(
            { 
                ok: false, 
                error: error instanceof Error ? error.message : String(error) 
            },
            { status: 500 }
        )
    }
}
