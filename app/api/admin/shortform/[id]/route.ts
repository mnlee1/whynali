/**
 * app/api/admin/shortform/[id]/route.ts
 *
 * [관리자 - 숏폼 job 단건 API]
 *
 * DELETE: 반려된 숏폼 job 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function DELETE(_request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('approval_status, issue_title, video_path')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.approval_status !== 'rejected') {
            return NextResponse.json(
                { error: 'INVALID_STATUS', message: '반려된 job만 삭제할 수 있습니다' },
                { status: 422 }
            )
        }

        // Storage에 영상 파일이 있으면 함께 삭제
        if (job.video_path) {
            const { error: storageError } = await supabaseAdmin
                .storage
                .from('shortform')
                .remove([job.video_path])

            if (storageError) {
                console.warn('[Storage 삭제 실패] 계속 진행:', storageError.message)
            }
        }

        const { error: deleteError } = await supabaseAdmin
            .from('shortform_jobs')
            .delete()
            .eq('id', id)

        if (deleteError) throw deleteError

        await writeAdminLog(
            '숏폼 job 삭제',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}"`
        )

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('숏폼 job 삭제 에러:', error)
        const message = error instanceof Error ? error.message : '숏폼 job 삭제 실패'
        return NextResponse.json(
            { error: 'DELETE_ERROR', message },
            { status: 500 }
        )
    }
}
