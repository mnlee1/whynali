/**
 * app/api/admin/longform/[id]/upload-youtube/route.ts
 *
 * [관리자 - 롱폼(옴니버스) YouTube 업로드 API]
 *
 * 생성된 옴니버스 롱폼 동영상을 YouTube에 일반 영상으로 업로드합니다.
 * 숏폼과 동일한 uploadToYouTube()를 재사용하되 isShort: false로 호출 —
 * Shorts 태그/URL 없이 일반 영상으로 등록됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { uploadToYouTube, getYoutubeUrl } from '@/lib/shortform/youtube-upload'
import { extractYoutubeHashtags } from '@/lib/shortform/generate-text'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 초 → 유튜브 챕터 타임스탬프 형식 (1시간 미만: m:ss, 이상: h:mm:ss) */
function formatTimestamp(totalSeconds: number): string {
    const s = Math.max(0, Math.round(totalSeconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    const ss = String(sec).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// 카테고리별 고정 해시태그 (숏폼 업로드 라우트와 동일)
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

export async function POST(_request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 1. Job 조회
        const { data: job, error: selectError } = await supabaseAdmin
            .from('longform_jobs')
            .select('*')
            .eq('id', id)
            .single()

        if (selectError || !job) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '롱폼 job을 찾을 수 없습니다' },
                { status: 404 }
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
                    url: (job.upload_status as any)?.youtube?.url,
                },
                { status: 409 }
            )
        }

        // 3. 동영상 버퍼 가져오기 (longform 버킷)
        const { data: videoData, error: downloadError } = await supabaseAdmin
            .storage
            .from('longform')
            .download(job.video_path)
        if (downloadError || !videoData) {
            return NextResponse.json(
                { error: 'DOWNLOAD_ERROR', message: 'Storage에서 동영상 다운로드 실패' },
                { status: 500 }
            )
        }
        const videoBuffer = Buffer.from(await videoData.arrayBuffer())

        // 4. 제목/설명/태그 구성 — 포함된 이슈마다 UTM 단축링크 + 카테고리 해시태그
        const titles: string[] = job.source_titles ?? []
        const sourceJobIds: string[] = job.source_job_ids ?? []
        const combinedTitle = titles.length > 0
            ? titles.join(' | ').slice(0, 100)
            : '왜난리 이슈 모아보기'

        const { data: sourceRows } = await supabaseAdmin
            .from('shortform_jobs')
            .select('id, issue_title, issue_url, issues(category, short_code)')
            .in('id', sourceJobIds)
        const sourceById = new Map((sourceRows ?? []).map(r => [r.id as string, r]))

        const siteUrl = 'https://whynali.com'
        const issueBlocks: string[] = []
        const hashtagGroups: string[] = []
        const allKeywords: string[] = []

        for (const jobId of sourceJobIds) {
            const row = sourceById.get(jobId) as any
            const title = row?.issue_title ?? ''
            if (!title) continue

            const shortCode = row?.issues?.short_code
            const issueUUID = row?.issue_url?.split('/issue/')[1]?.split('?')[0] ?? ''
            const issueSlug = shortCode || issueUUID
            const issueUrl = issueSlug ? `${siteUrl}/i/${issueSlug}?utm_source=youtube` : siteUrl

            issueBlocks.push(`${title}\n── 자세히보기→\n${issueUrl}`)

            const category = row?.issues?.category ?? ''
            const categoryTag = CATEGORY_HASHTAGS[category] ?? ''
            const keywords = await extractYoutubeHashtags(title)
            allKeywords.push(...keywords)
            const keywordTags = keywords.map(k => `#${k.replace(/\s+/g, '')}`).join(' ')
            hashtagGroups.push(`${categoryTag} ${keywordTags}`.replace(/\s+/g, ' ').trim())
        }

        // 챕터(타임스탬프) — 생성 시점에 upload_status.chapters로 저장해둔 값 (마이그레이션 없이 재사용)
        const chapters: { label: string; startSeconds: number }[] = (job.upload_status as any)?.chapters ?? []
        const chapterLines = chapters.map(c => `${formatTimestamp(c.startSeconds)} ${c.label}`).join('\n')

        const description = [
            '요즘 난리 한눈에 👀, 왜난리에서 바로 확인하세요!',
            '',
            ...(chapterLines ? [chapterLines, ''] : []),
            issueBlocks.join('\n\n'),
            '',
            '요즘 난리 한눈에 👀, 왜난리',
            siteUrl,
            '',
            '#왜난리 #이슈 #뉴스 #한국뉴스',
            ...hashtagGroups,
        ].join('\n')

        const videoId = await uploadToYouTube(videoBuffer, {
            title: combinedTitle,
            description,
            tags: ['왜난리', '이슈모음', '뉴스', '한국뉴스', ...allKeywords],
            isShort: false,
        })

        const youtubeUrl = getYoutubeUrl(videoId)

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
            .from('longform_jobs')
            .update({ upload_status: newUploadStatus, youtube_uploaded_at: new Date().toISOString() })
            .eq('id', id)

        if (updateError) {
            console.error('롱폼 job 업데이트 실패:', updateError)
            return NextResponse.json(
                { error: 'UPDATE_ERROR', message: 'Job 업데이트 실패' },
                { status: 500 }
            )
        }

        await writeAdminLog(
            '롱폼 YouTube 업로드',
            'longform_job',
            id,
            auth.adminEmail,
            `이슈 ${titles.length}개 → ${youtubeUrl}`
        )

        return NextResponse.json({
            success: true,
            url: youtubeUrl,
            videoId,
        })
    } catch (error) {
        console.error('롱폼 YouTube 업로드 에러:', error)
        const message = error instanceof Error ? error.message : 'YouTube 업로드 실패'

        // 실패 상태 DB 기록
        try {
            const { data: job } = await supabaseAdmin
                .from('longform_jobs')
                .select('upload_status')
                .eq('id', id)
                .single()
            const failedStatus = {
                ...(job?.upload_status || {}),
                youtube: {
                    status: 'failed',
                    error: message,
                    failedAt: new Date().toISOString(),
                },
            }
            await supabaseAdmin
                .from('longform_jobs')
                .update({ upload_status: failedStatus })
                .eq('id', id)
        } catch {
            // 상태 기록 실패는 무시
        }

        return NextResponse.json(
            { error: 'UPLOAD_ERROR', message },
            { status: 500 }
        )
    }
}
