/**
 * app/api/admin/shortform/[id]/upload-instagram/route.ts
 *
 * POST /api/admin/shortform/:id/upload-instagram
 *
 * Supabase Storage의 MP4를 Instagram Reels에 업로드
 * Instagram Graph API는 공개 URL을 사용하므로 파일 다운로드 불필요
 * 어드민 전용 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin-log'
import { uploadToInstagram, getInstagramPostUrl } from '@/lib/shortform/instagram-upload'
import { extractYoutubeHashtags } from '@/lib/shortform/generate-text'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/shortform/:id/upload-instagram
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
    const { id: jobId } = await params

    try {
        // 1. shortform_job 조회
        const { data: job, error: jobError } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_id, issue_title, issue_url, approval_status, video_path, upload_status, issues(category)')
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
                { error: 'NOT_APPROVED', message: '승인된 job만 Instagram에 업로드할 수 있습니다' },
                { status: 400 }
            )
        }

        if (!job.video_path) {
            return NextResponse.json(
                { error: 'NO_VIDEO', message: '먼저 동영상을 업로드해주세요' },
                { status: 400 }
            )
        }

        // Instagram 업로드 중복 체크
        const currentUploadStatus = job.upload_status as any
        if (currentUploadStatus?.instagram?.status === 'success') {
            return NextResponse.json(
                { error: 'ALREADY_UPLOADED', message: '이미 Instagram에 업로드되었습니다' },
                { status: 400 }
            )
        }

        // 2. 동영상 공개 URL 가져오기 (URL 또는 Supabase Storage 경로 모두 지원)
        let videoPublicUrl: string
        if (job.video_path.startsWith('http')) {
            videoPublicUrl = job.video_path
        } else {
            const { data: urlData } = supabaseAdmin.storage
                .from('shortform')
                .getPublicUrl(job.video_path)
            if (!urlData?.publicUrl) {
                return NextResponse.json(
                    { error: 'URL_FAILED', message: 'Storage 공개 URL을 가져올 수 없습니다' },
                    { status: 500 }
                )
            }
            videoPublicUrl = urlData.publicUrl
        }

        // 카테고리별 해시태그 매핑
        const CATEGORY_HASHTAGS: Record<string, string> = {
            '연예': '#연예 #연예이슈 #셀럽',
            '정치': '#정치 #정치이슈',
            '스포츠': '#스포츠 #스포츠이슈',
            '사회': '#사회 #사회이슈',
            '경제': '#경제 #경제이슈',
            '기술': '#기술 #IT #테크',
            '세계': '#세계 #해외이슈 #글로벌',
            '생활문화': '#생활 #문화 #라이프',
        }
        const issueCategory = (job.issues as any)?.[0]?.category ?? (job.issues as any)?.category ?? ''
        const categoryTag = CATEGORY_HASHTAGS[issueCategory] ?? ''

        // 이슈 제목 파생 키워드 (Groq)
        const titleKeywords = await extractYoutubeHashtags(job.issue_title)
        const titleTags = titleKeywords.map((k: string) => `#${k.replace(/\s+/g, '')}`).join(' ')

        const issueId = job.issue_url?.split('/issue/')[1]?.split('?')[0] ?? ''
        const shortId = issueId.substring(0, 8)
        const publicIssueUrl = shortId ? `https://whynali.com/i/${shortId}` : 'https://whynali.com'

        const caption = [
            `${job.issue_title} | 왜난리`,
            '',
            `📌 실시간 여론·토론·타임라인 확인하기`,
            publicIssueUrl,
            '',
            `#왜난리 #이슈 #뉴스 #한국뉴스 ${categoryTag} ${titleTags}`.replace(/\s+/g, ' ').trim(),
        ].join('\n')

        // 3. Instagram 업로드
        let mediaId: string
        try {
            mediaId = await uploadToInstagram(videoPublicUrl, {
                caption,
                shareToFeed: true,
            })

            const instagramUsername = process.env.INSTAGRAM_USERNAME || 'whynali'
            const profileUrl = getInstagramPostUrl(instagramUsername)

            // 4. upload_status 업데이트
            const newUploadStatus = {
                ...currentUploadStatus,
                instagram: {
                    status: 'success',
                    mediaId,
                    profileUrl,
                    uploadedAt: new Date().toISOString(),
                },
            }

            const { error: updateError } = await supabaseAdmin
                .from('shortform_jobs')
                .update({ upload_status: newUploadStatus, video_path: null })
                .eq('id', jobId)

            if (updateError) {
                console.error('[upload-instagram] upload_status 업데이트 실패:', updateError)
            }

            // Storage 영상 삭제 (업로드 완료 후 공간 절약)
            if (job.video_path && !job.video_path.startsWith('http')) {
                const { error: storageError } = await supabaseAdmin
                    .storage.from('shortform').remove([job.video_path])
                if (storageError) {
                    console.warn('[upload-instagram] Storage 삭제 실패 (무시):', storageError.message)
                }
            }

            // 5. 어드민 로그
            await writeAdminLog(
                'shortform_instagram_upload',
                'shortform_job',
                jobId,
                auth.adminEmail,
                JSON.stringify({
                    issueId: job.issue_id,
                    issueTitle: job.issue_title,
                    instagramMediaId: mediaId,
                    instagramProfileUrl: profileUrl,
                })
            )

            return NextResponse.json({
                success: true,
                platform: 'instagram',
                mediaId,
                profileUrl,
                message: 'Instagram 업로드 성공! 프로필에서 확인할 수 있습니다.',
            })
        } catch (uploadError: any) {
            console.error('[upload-instagram] Instagram 업로드 실패:', uploadError)

            // 실패 상태 기록
            const failedUploadStatus = {
                ...currentUploadStatus,
                instagram: {
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
                    error: 'INSTAGRAM_UPLOAD_FAILED',
                    message: `Instagram 업로드 실패: ${uploadError.message}`,
                },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('[upload-instagram] 예상치 못한 오류:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' },
            { status: 500 }
        )
    }
}
