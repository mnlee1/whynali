/**
 * app/api/test/reset-job/route.ts
 * 
 * [테스트 전용 - Job 상태 초기화 API]
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { issueId } = body

        if (!issueId) {
            return NextResponse.json(
                { error: 'INVALID_INPUT', message: 'issueId는 필수입니다' },
                { status: 400 }
            )
        }

        // 1. 해당 이슈의 job을 대기 상태로 초기화
        const { data: resetData, error: resetError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({
                video_path: null,
                approval_status: 'pending',
                upload_status: null,
                ai_validation: null,
            })
            .eq('issue_id', issueId)
            .select()

        if (resetError) {
            throw resetError
        }

        // 2. 결과 조회
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_title, approval_status, video_path, upload_status, created_at')
            .eq('issue_id', issueId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (selectError) {
            throw selectError
        }

        return NextResponse.json({
            success: true,
            message: 'Job이 대기 상태로 초기화되었습니다',
            resetCount: resetData?.length ?? 0,
            job,
        })
    } catch (error) {
        console.error('Job 초기화 에러:', error)
        const message = error instanceof Error ? error.message : 'Job 초기화 실패'
        return NextResponse.json(
            { error: 'RESET_ERROR', message },
            { status: 500 }
        )
    }
}
