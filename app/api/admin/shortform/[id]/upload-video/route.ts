/**
 * app/api/admin/shortform/[id]/upload-video/route.ts
 * 
 * POST /api/admin/shortform/:id/upload-video
 * 
 * 어드민이 수동 제작한 MP4 파일을 Supabase Storage에 업로드하고 video_path 업데이트
 * 어드민 전용 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin-log'

/**
 * POST /api/admin/shortform/:id/upload-video
 * 
 * Request Body: FormData
 * - video: File (MP4)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
    const { id: jobId } = await params

    try {
        const formData = await request.formData()
        const videoFile = formData.get('video') as File | null

        if (!videoFile) {
            return NextResponse.json(
                { error: 'MISSING_FILE', message: '동영상 파일이 필요합니다' },
                { status: 400 }
            )
        }

        if (!videoFile.type.startsWith('video/')) {
            return NextResponse.json(
                { error: 'INVALID_FILE_TYPE', message: '동영상 파일만 업로드 가능합니다' },
                { status: 400 }
            )
        }

        // 1. shortform_job 조회
        const { data: job, error: jobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_id, issue_title, approval_status, video_path')
            .eq('id', jobId)
            .single()

        if (jobError || !job) {
            return NextResponse.json(
                { error: 'JOB_NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        if (job.approval_status !== 'approved') {
            return NextResponse.json(
                { error: 'NOT_APPROVED', message: '승인된 job만 동영상을 업로드할 수 있습니다' },
                { status: 400 }
            )
        }

        // 2. Storage에 기존 파일이 있다면 삭제
        if (job.video_path) {
            const oldFileName = job.video_path.split('/').pop()
            if (oldFileName) {
                await supabaseAdmin.storage
                    .from('shortform')
                    .remove([oldFileName])
            }
        }

        // 3. 파일명 생성 (shortform-{jobId}-{timestamp}.mp4)
        const timestamp = Date.now()
        const fileName = `shortform-${jobId}-${timestamp}.mp4`

        // 4. Supabase Storage에 업로드
        const arrayBuffer = await videoFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await supabaseAdmin.storage
            .from('shortform')
            .upload(fileName, buffer, {
                contentType: videoFile.type,
                upsert: false,
            })

        if (uploadError) {
            console.error('[upload-video] Storage 업로드 실패:', uploadError)
            return NextResponse.json(
                { error: 'UPLOAD_FAILED', message: 'Storage 업로드 중 오류가 발생했습니다' },
                { status: 500 }
            )
        }

        // 5. video_path 업데이트
        const { data: publicUrl } = supabaseAdmin.storage
            .from('shortform')
            .getPublicUrl(fileName)

        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: publicUrl.publicUrl })
            .eq('id', jobId)

        if (updateError) {
            console.error('[upload-video] video_path 업데이트 실패:', updateError)
            return NextResponse.json(
                { error: 'UPDATE_FAILED', message: 'video_path 업데이트 중 오류가 발생했습니다' },
                { status: 500 }
            )
        }

        // 6. 어드민 로그
        await writeAdminLog(
            'shortform_video_upload',
            'shortform_job',
            jobId,
            auth.adminEmail,
            JSON.stringify({
                fileName,
                fileSize: buffer.length,
                issueId: job.issue_id,
                issueTitle: job.issue_title,
            })
        )

        return NextResponse.json({
            success: true,
            videoUrl: publicUrl.publicUrl,
            fileName,
        })
    } catch (error) {
        console.error('[upload-video] 예상치 못한 오류:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' },
            { status: 500 }
        )
    }
}
