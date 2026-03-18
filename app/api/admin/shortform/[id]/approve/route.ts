/**
 * app/api/admin/shortform/[id]/approve/route.ts
 * 
 * [관리자 - 숏폼 job 승인 API]
 * 
 * pending 상태의 숏폼 job을 승인하여 approved 상태로 전환.
 * 승인 후 실제 영상 생성은 별도 워커에서 처리.
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

        if (job.approval_status !== 'pending') {
            return NextResponse.json(
                { error: 'INVALID_STATUS', message: 'pending 상태의 job만 승인할 수 있습니다' },
                { status: 422 }
            )
        }

        // 승인 처리
        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ approval_status: 'approved' })
            .eq('id', id)

        if (updateError) {
            throw updateError
        }

        await writeAdminLog(
            '숏폼 job 승인',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" (${job.issue_id})`
        )

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('숏폼 job 승인 에러:', error)
        const message = error instanceof Error ? error.message : '숏폼 job 승인 실패'
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message },
            { status: 500 }
        )
    }
}
