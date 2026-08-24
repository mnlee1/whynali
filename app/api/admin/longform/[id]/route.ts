/**
 * app/api/admin/longform/[id]/route.ts
 *
 * [관리자 - 롱폼(옴니버스) job 단건 API]
 *
 * DELETE: 롱폼 job 완전 삭제 (Storage 영상 파일 + DB row).
 * 이미 YouTube에 업로드된 job이어도 삭제 가능하지만, YouTube의 실제 영상은 지워지지 않고
 * 우리 쪽 기록(row)만 없어진다 — 유튜브 콘텐츠 자체는 유튜브에서 직접 삭제해야 함.
 *
 * 이 job에 쓰인 숏폼들은 삭제 즉시 "다른 롱폼에 사용된 적 없는 후보"로 다시 노출된다
 * (LongformTab의 후보 필터가 살아있는 longform_jobs.source_job_ids만 보기 때문).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
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
            .from('longform_jobs')
            .select('source_titles, video_path')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '롱폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.video_path) {
            const { error: storageError } = await supabaseAdmin
                .storage
                .from('longform')
                .remove([job.video_path])

            if (storageError) {
                console.warn('[longform delete] Storage 삭제 실패, 계속 진행:', storageError.message)
            }
        }

        const { error: deleteError } = await supabaseAdmin
            .from('longform_jobs')
            .delete()
            .eq('id', id)

        if (deleteError) throw deleteError

        await writeAdminLog(
            '롱폼 job 삭제',
            'longform_job',
            id,
            auth.adminEmail,
            `이슈: ${(job.source_titles ?? []).join(' → ')}`
        )

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('롱폼 job 삭제 에러:', error)
        const message = error instanceof Error ? error.message : '롱폼 job 삭제 실패'
        return NextResponse.json({ error: 'DELETE_ERROR', message }, { status: 500 })
    }
}
