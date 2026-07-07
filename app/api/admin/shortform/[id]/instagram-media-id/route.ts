/**
 * app/api/admin/shortform/[id]/instagram-media-id/route.ts
 *
 * POST /api/admin/shortform/:id/instagram-media-id
 *
 * 자동 업로드 플로우를 거치지 않고 인스타그램에 수동으로 올린 게시물의
 * media ID를 등록한다 (예: 자동등록 결과물이 마음에 안 들어 삭제 후 수동 재업로드한 경우).
 * 등록 즉시 해당 media ID로 성과 데이터도 함께 조회해 저장한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { getInstagramPostUrl } from '@/lib/shortform/instagram-upload'
import { fetchInstagramStats, type PlatformStats } from '@/lib/shortform/fetch-platform-stats'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id: jobId } = await params

    const body = await request.json().catch(() => null)
    const mediaId = typeof body?.mediaId === 'string' ? body.mediaId.trim() : ''
    if (!mediaId) {
        return NextResponse.json(
            { error: 'INVALID_MEDIA_ID', message: 'mediaId를 입력해주세요' },
            { status: 400 },
        )
    }

    const { data: job, error: jobError } = await supabaseAdmin
        .from('shortform_jobs')
        .select('id, issue_title, upload_status, platform_stats')
        .eq('id', jobId)
        .single()

    if (jobError || !job) {
        return NextResponse.json(
            { error: 'NOT_FOUND', message: '숏폼 job을 찾을 수 없습니다' },
            { status: 404 },
        )
    }

    const currentUploadStatus = (job.upload_status ?? {}) as Record<string, any>
    const profileUrl = getInstagramPostUrl(process.env.INSTAGRAM_USERNAME || 'whynali')

    const newUploadStatus = {
        ...currentUploadStatus,
        instagram: {
            status: 'success',
            mediaId,
            profileUrl,
            uploadedAt: new Date().toISOString(),
            manual: true, // 자동 업로드 API를 거치지 않고 수동으로 연결된 게시물
        },
    }

    // 등록 즉시 성과 데이터도 시도 — 실패해도 mediaId 등록 자체는 진행
    const newStats: PlatformStats = { ...(job.platform_stats ?? {}) }
    let statsWarning: string | undefined
    try {
        newStats.instagram = await fetchInstagramStats(mediaId)
    } catch (err) {
        statsWarning = err instanceof Error ? err.message : 'Instagram 성과 데이터 조회 실패'
        console.error(`[instagram-media-id] 성과 조회 실패 (${jobId}):`, statsWarning)
    }

    const { error: updateError } = await supabaseAdmin
        .from('shortform_jobs')
        .update({ upload_status: newUploadStatus, platform_stats: newStats })
        .eq('id', jobId)

    if (updateError) {
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: 'mediaId 저장 실패' },
            { status: 500 },
        )
    }

    await writeAdminLog(
        'shortform_instagram_media_id_manual_set',
        'shortform_job',
        jobId,
        auth.adminEmail,
        JSON.stringify({ issueTitle: job.issue_title, mediaId, statsFetched: !statsWarning }),
    )

    return NextResponse.json({
        success: true,
        mediaId,
        profileUrl,
        statsFetched: !statsWarning,
        ...(statsWarning ? { warning: statsWarning } : {}),
    })
}
