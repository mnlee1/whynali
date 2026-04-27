/**
 * app/api/admin/shortform/[id]/delete-storage/route.ts
 *
 * [관리자 - 숏폼 Storage 영상만 삭제]
 *
 * DB 레코드는 유지하고 Supabase Storage의 MP4 파일만 삭제.
 * 모든 플랫폼 업로드 완료 후 공간 절약 목적으로 사용.
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
            .select('video_path, issue_title')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_VIDEO', message: 'Storage에 저장된 영상이 없습니다' },
                { status: 422 }
            )
        }

        // Storage 파일 삭제
        if (!job.video_path.startsWith('http')) {
            const { error: storageError } = await supabaseAdmin
                .storage.from('shortform').remove([job.video_path])
            if (storageError) {
                console.warn('[delete-storage] Storage 삭제 실패:', storageError.message)
            }
        }

        // DB의 video_path null 처리
        await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: null })
            .eq('id', id)

        await writeAdminLog(
            '숏폼 Storage 영상 삭제',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}"`
        )

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[delete-storage] 에러:', error)
        return NextResponse.json(
            { error: 'ERROR', message: 'Storage 삭제 실패' },
            { status: 500 }
        )
    }
}
