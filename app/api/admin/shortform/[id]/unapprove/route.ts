/**
 * app/api/admin/shortform/[id]/unapprove/route.ts
 *
 * [관리자 - 숏폼 job 승인 취소 API]
 *
 * approved 상태의 숏폼 job을 pending(대기)으로 되돌립니다.
 * YouTube 업로드가 완료된 job은 취소할 수 없습니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function PATCH(_request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('approval_status, issue_title, upload_status')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.approval_status !== 'approved') {
            return NextResponse.json(
                { error: 'INVALID_STATUS', message: '승인된 job만 취소할 수 있습니다' },
                { status: 422 }
            )
        }

        // YouTube 업로드 완료된 경우 취소 불가
        const youtubeStatus = (job.upload_status as any)?.youtube?.status
        if (youtubeStatus === 'success') {
            return NextResponse.json(
                { error: 'ALREADY_UPLOADED', message: 'YouTube 업로드가 완료된 job은 승인 취소할 수 없습니다' },
                { status: 422 }
            )
        }

        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ approval_status: 'pending' })
            .eq('id', id)

        if (updateError) throw updateError

        await writeAdminLog(
            '숏폼 job 승인 취소',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" → 대기 상태로 복귀`
        )

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('숏폼 job 승인 취소 에러:', error)
        const message = error instanceof Error ? error.message : '승인 취소 실패'
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message },
            { status: 500 }
        )
    }
}
