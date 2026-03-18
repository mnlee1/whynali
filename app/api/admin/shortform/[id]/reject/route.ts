/**
 * app/api/admin/shortform/[id]/reject/route.ts
 * 
 * [관리자 - 숏폼 job 반려 API]
 * 
 * pending 또는 approved 상태의 숏폼 job을 반려 처리.
 * approval_status를 'rejected'로 변경 (삭제하지 않음).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 현재 job 상태 확인
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('approval_status, issue_title, issue_id')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.approval_status === 'rejected') {
            return NextResponse.json(
                { error: 'ALREADY_REJECTED', message: '이미 반려된 job입니다' },
                { status: 422 }
            )
        }

        // 반려 처리
        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ approval_status: 'rejected' })
            .eq('id', id)

        if (updateError) {
            throw updateError
        }

        await writeAdminLog(
            '숏폼 job 반려',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" (${job.issue_id})`
        )

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('숏폼 job 반려 에러:', error)
        const message = error instanceof Error ? error.message : '숏폼 job 반려 실패'
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message },
            { status: 500 }
        )
    }
}
