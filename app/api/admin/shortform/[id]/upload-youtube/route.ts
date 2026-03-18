/**
 * app/api/admin/shortform/[id]/upload-youtube/route.ts
 * 
 * POST /api/admin/shortform/:id/upload-youtube
 * 
 * Supabase Storage에 저장된 MP4를 YouTube Shorts에 업로드
 * 어드민 전용 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin-log'
import { uploadToYouTube, getYoutubeShortsUrl } from '@/lib/shortform/youtube-upload'

/**
 * POST /api/admin/shortform/:id/upload-youtube
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
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
                { error: 'NOT_APPROVED', message: '승인된 job만 YouTube에 업로드할 수 있습니다' },
                { status: 400 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_VIDEO', message: '먼저 동영상을 업로드해주세요' },
                { status: 400 }
            )
        }

        // YouTube 업로드 중복 체크
        const currentUploadStatus = job.upload_status as any
        if (currentUploadStatus?.youtube?.status === 'success') {
            return NextResponse.json(
                { error: 'ALREADY_UPLOADED', message: '이미 YouTube에 업로드되었습니다' },
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
            console.error('[upload-youtube] Storage 다운로드 실패:', downloadError)
            return NextResponse.json(
                { error: 'DOWNLOAD_FAILED', message: 'Storage에서 동영상을 가져올 수 없습니다' },
                { status: 500 }
            )
        }

        const videoBuffer = Buffer.from(await videoData.arrayBuffer())

        // 3. YouTube 업로드
        let videoId: string
        try {
            videoId = await uploadToYouTube(videoBuffer, {
                title: `${job.issue_title} | 왜난리`,
                description: `${job.issue_title}\n\n자세한 내용은 왜난리에서 확인하세요:\n${job.issue_url}`,
                tags: ['왜난리', '이슈', '트렌드', '한국'],
                categoryId: '25', // 25 = News & Politics
            })

            const youtubeUrl = getYoutubeShortsUrl(videoId)

            // 4. upload_status 업데이트
            const newUploadStatus = {
                youtube: {
                    status: 'success',
                    videoId,
                    url: youtubeUrl,
                    uploadedAt: new Date().toISOString(),
                },
            }

            const { error: updateError } = await supabaseAdmin
                .from('shortform_jobs')
                .update({ upload_status: newUploadStatus })
                .eq('id', jobId)

            if (updateError) {
                console.error('[upload-youtube] upload_status 업데이트 실패:', updateError)
            }

            // 5. 어드민 로그
            await writeAdminLog(
                'shortform_youtube_upload',
                'shortform_job',
                jobId,
                auth.adminEmail,
                JSON.stringify({
                    issueId: job.issue_id,
                    issueTitle: job.issue_title,
                    youtubeVideoId: videoId,
                    youtubeUrl,
                })
            )

            return NextResponse.json({
                success: true,
                platform: 'youtube',
                videoId,
                url: youtubeUrl,
            })
        } catch (uploadError: any) {
            console.error('[upload-youtube] YouTube 업로드 실패:', uploadError)

            // 실패 상태 기록
            const failedUploadStatus = {
                youtube: {
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
                    error: 'YOUTUBE_UPLOAD_FAILED', 
                    message: `YouTube 업로드 실패: ${uploadError.message}` 
                },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('[upload-youtube] 예상치 못한 오류:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' },
            { status: 500 }
        )
    }
}
