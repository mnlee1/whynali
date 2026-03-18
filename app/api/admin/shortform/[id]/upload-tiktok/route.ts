/**
 * app/api/admin/shortform/[id]/upload-tiktok/route.ts
 * 
 * POST /api/admin/shortform/:id/upload-tiktok
 * 
 * Supabase Storage에 저장된 MP4를 TikTok에 업로드
 * 어드민 전용 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin-log'
import { uploadToTikTok, getTikTokProfileUrl } from '@/lib/shortform/tiktok-upload'

/**
 * POST /api/admin/shortform/:id/upload-tiktok
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const adminUser = await requireAdmin()
    const { id: jobId } = await params

    try {
        // 1. shortform_job 조회
        const { data: job, error: jobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_id, issue_title, issue_url, approval_status, video_path, upload_status')
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
                { error: 'NOT_APPROVED', message: '승인된 job만 TikTok에 업로드할 수 있습니다' },
                { status: 400 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_VIDEO', message: '먼저 동영상을 업로드해주세요' },
                { status: 400 }
            )
        }

        // TikTok 업로드 중복 체크
        const currentUploadStatus = job.upload_status as any
        if (currentUploadStatus?.tiktok?.status === 'success') {
            return NextResponse.json(
                { error: 'ALREADY_UPLOADED', message: '이미 TikTok에 업로드되었습니다' },
                { status: 400 }
            )
        }

        // 2. Supabase Storage에서 동영상 다운로드
        const fileName = job.video_path.split('/').pop()
        if (!fileName) {
            return NextResponse.json(
                { error: 'INVALID_VIDEO_PATH', message: '동영상 경로가 올바르지 않습니다' },
                { status: 400 }
            )
        }

        const { data: videoData, error: downloadError } = await supabaseAdmin.storage
            .from('shortform')
            .download(fileName)

        if (downloadError || !videoData) {
            console.error('[upload-tiktok] Storage 다운로드 실패:', downloadError)
            return NextResponse.json(
                { error: 'DOWNLOAD_FAILED', message: 'Storage에서 동영상을 가져올 수 없습니다' },
                { status: 500 }
            )
        }

        const videoBuffer = Buffer.from(await videoData.arrayBuffer())

        // 3. TikTok 업로드
        let publishId: string
        try {
            publishId = await uploadToTikTok(videoBuffer, {
                title: `${job.issue_title} | 왜난리`,
                description: `${job.issue_title}\n\n자세한 내용은 왜난리에서 확인하세요:\n${job.issue_url}\n\n#왜난리 #이슈 #트렌드 #뉴스`,
                privacyLevel: 'PUBLIC_TO_EVERYONE',
                disableComment: false,
                disableDuet: true,
                disableStitch: true,
            })

            const tiktokUsername = process.env.TIKTOK_USERNAME || 'whynali'
            const profileUrl = getTikTokProfileUrl(tiktokUsername)

            // 4. upload_status 업데이트
            const newUploadStatus = {
                ...currentUploadStatus,
                tiktok: {
                    status: 'success',
                    publishId,
                    profileUrl,
                    uploadedAt: new Date().toISOString(),
                },
            }

            const { error: updateError } = await supabaseAdmin
                .from('shortform_jobs')
                .update({ upload_status: newUploadStatus })
                .eq('id', jobId)

            if (updateError) {
                console.error('[upload-tiktok] upload_status 업데이트 실패:', updateError)
            }

            // 5. 어드민 로그
            await writeAdminLog({
                adminUserId: adminUser.id,
                action: 'shortform_tiktok_upload',
                targetType: 'shortform_job',
                targetId: jobId,
                details: {
                    issueId: job.issue_id,
                    issueTitle: job.issue_title,
                    tiktokPublishId: publishId,
                    tiktokProfileUrl: profileUrl,
                },
            })

            return NextResponse.json({
                success: true,
                platform: 'tiktok',
                publishId,
                profileUrl,
                message: 'TikTok 업로드 성공! 프로필에서 확인할 수 있습니다.',
            })
        } catch (uploadError: any) {
            console.error('[upload-tiktok] TikTok 업로드 실패:', uploadError)

            // 실패 상태 기록
            const failedUploadStatus = {
                ...currentUploadStatus,
                tiktok: {
                    status: 'failed',
                    error: uploadError.message || '알 수 없는 오류',
                    failedAt: new Date().toISOString(),
                },
            }

            await supabaseAdmin
                .from('shortform_jobs')
                .update({ upload_status: failedUploadStatus })
                .eq('id', jobId)

            return NextResponse.json(
                { 
                    error: 'TIKTOK_UPLOAD_FAILED', 
                    message: `TikTok 업로드 실패: ${uploadError.message}` 
                },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('[upload-tiktok] 예상치 못한 오류:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' },
            { status: 500 }
        )
    }
}
