/**
 * app/api/admin/candidates/route.ts
 *
 * [관리자 - 이슈 후보 알람 조회 API]
 *
 * 현재 5건 이상 조건을 충족하는 이슈 후보 목록을 반환합니다.
 * 관리자 이슈 페이지 상단 알람 배너에서 사용합니다.
 *
 * 예시 응답:
 * {
 *   alerts: [{ title: "OO 논란", count: 7, newsCount: 4, communityCount: 3 }],
 *   evaluated: 23
 * }
 */

import { NextResponse } from 'next/server'
import { evaluateCandidates } from '@/lib/candidate/issue-candidate'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const result = await evaluateCandidates()

        return NextResponse.json({
            alerts: result.alerts,
            evaluated: result.evaluated,
        })
    } catch (error) {
        console.error('이슈 후보 조회 에러:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '후보 조회 실패' },
            { status: 500 }
        )
    }
}
