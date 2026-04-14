/**
 * app/api/admin/shortform/[id]/upload-youtube/route.ts
 * 
 * [관리자 - YouTube Shorts 업로드 API]
 * 
 * 생성된 숏폼 동영상을 YouTube Shorts에 업로드합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { uploadToYouTube, getYoutubeShortsUrl } from '@/lib/shortform/youtube-upload'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(_request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 1. Job 조회
        const { data: job, error: selectError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('*')
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
                { error: 'NOT_APPROVED', message: '승인된 job만 업로드할 수 있습니다' },
                { status: 422 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_VIDEO', message: '동영상이 생성되지 않았습니다' },
                { status: 422 }
            )
        }

        // 2. 이미 업로드된 경우 체크
        const youtubeStatus = (job.upload_status as any)?.youtube?.status
        if (youtubeStatus === 'success') {
            return NextResponse.json(
                { 
                    error: 'ALREADY_UPLOADED', 
                    message: '이미 YouTube에 업로드되었습니다',
                    url: (job.upload_status as any)?.youtube?.url
                },
                { status: 409 }
            )
        }

        // 3. Supabase Storage에서 동영상 다운로드
        const { data: videoData, error: downloadError } = await supabaseAdmin
            .storage
            .from('shortform')
            .download(job.video_path)

        if (downloadError || !videoData) {
            return NextResponse.json(
                { error: 'DOWNLOAD_ERROR', message: 'Storage에서 동영상 다운로드 실패' },
                { status: 500 }
            )
        }

        const videoBuffer = Buffer.from(await videoData.arrayBuffer())

        // 4. YouTube 업로드 (issue_url에서 issue ID 추출 후 실서버 URL로 재조합)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'
        const issueId = job.issue_url.split('/issue/')[1]?.split('?')[0] ?? ''
        const publicIssueUrl = issueId ? `${siteUrl}/issue/${issueId}` : siteUrl

        const videoId = await uploadToYouTube(videoBuffer, {
            title: job.issue_title,
            description: `지금 뜨거운 이슈! ${job.issue_title}\n\n` +
                `📌 왜난리에서 실시간 여론·토론·타임라인 확인하기\n` +
                `${publicIssueUrl}\n\n` +
                `#왜난리 #이슈 #논란 #${job.issue_status}`,
            tags: ['왜난리', '이슈', '논란', job.issue_status],
        })

        const youtubeUrl = getYoutubeShortsUrl(videoId)

        // 5. Job의 upload_status 업데이트
        const newUploadStatus = {
            ...(job.upload_status || {}),
            youtube: {
                status: 'success',
                url: youtubeUrl,
                video_id: videoId,
                uploaded_at: new Date().toISOString(),
            },
        }

        const { error: updateError } = await supabaseAdmin
            .from('shortform_jobs')
            .update({ upload_status: newUploadStatus })
            .eq('id', id)

        if (updateError) {
            console.error('Job 업데이트 실패:', updateError)
            return NextResponse.json(
                { error: 'UPDATE_ERROR', message: 'Job 업데이트 실패' },
                { status: 500 }
            )
        }

        await writeAdminLog(
            'YouTube Shorts 업로드',
            'shortform_job',
            id,
            auth.adminEmail,
            `이슈: "${job.issue_title}" → ${youtubeUrl}`
        )

        return NextResponse.json({
            success: true,
            url: youtubeUrl,
            videoId,
        })
    } catch (error) {
        console.error('YouTube 업로드 에러:', error)
        const message = error instanceof Error ? error.message : 'YouTube 업로드 실패'
        return NextResponse.json(
            { error: 'UPLOAD_ERROR', message },
            { status: 500 }
        )
    }
}
