/**
 * app/api/cron/auto-create-issue/route.ts
 *
 * [이슈 후보 자동 생성 Cron]
 *
 * 30분마다 실행되며 수집된 뉴스·커뮤니티 데이터를 분석해
 * 07_이슈등록_화력_정렬_규격 §1 조건에 따라 이슈를 자동 생성합니다.
 *
 * GitHub Actions에서 호출: .github/workflows/cron-auto-create-issue.yml
 */

import { NextRequest, NextResponse } from 'next/server'
import { evaluateCandidates } from '@/lib/candidate/issue-candidate'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        const startTime = Date.now()
        const result = await evaluateCandidates()
        const elapsed = Date.now() - startTime

        return NextResponse.json({
            success: true,
            created: result.created,
            alerts: result.alerts.length,
            alertDetails: result.alerts,
            evaluated: result.evaluated,
            elapsed: `${elapsed}ms`,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('이슈 후보 자동 생성 Cron 에러:', error)
        return NextResponse.json(
            {
                error: 'AUTO_CREATE_ERROR',
                message: '이슈 자동 생성 실패',
            },
            { status: 500 }
        )
    }
}
