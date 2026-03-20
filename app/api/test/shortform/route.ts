/**
 * app/api/test/shortform/route.ts
 * 
 * [테스트 전용 - 숏폼 job 생성 API]
 * 
 * 인증 없이 job을 생성할 수 있는 테스트 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server'
import { createShortformJob } from '@/lib/shortform/create-job'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { issueId, triggerType = 'issue_created' } = body

        if (!issueId) {
            return NextResponse.json(
                { error: 'INVALID_INPUT', message: 'issueId는 필수입니다' },
                { status: 400 }
            )
        }

        const jobId = await createShortformJob({ issueId, triggerType })

        if (!jobId) {
            return NextResponse.json(
                { error: 'SKIPPED', message: '빈도 제어로 인해 job 생성이 스킵되었습니다' },
                { status: 200 }
            )
        }

        return NextResponse.json({ 
            success: true,
            jobId,
            message: 'Job 생성 완료'
        }, { status: 201 })
    } catch (error) {
        console.error('테스트 job 생성 에러:', error)
        const message = error instanceof Error ? error.message : 'Job 생성 실패'
        return NextResponse.json(
            { error: 'CREATE_ERROR', message },
            { status: 500 }
        )
    }
}
