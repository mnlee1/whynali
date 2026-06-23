/**
 * app/api/admin/shortform/[id]/fetch-stats/route.ts
 *
 * POST /api/admin/shortform/:id/fetch-stats
 *
 * 업로드된 숏폼의 플랫폼별 성과 지표를 수집해 platform_stats 컬럼에 저장.
 * 업로드된 플랫폼만 조회 (upload_status.*.status === 'success' 기준).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { fetchYoutubeStats, fetchInstagramStats, type PlatformStats } from '@/lib/shortform/fetch-platform-stats'

export const dynamic = 'force-dynamic'

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id: jobId } = await params

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

    const uploadStatus = (job.upload_status ?? {}) as Record<string, any>
    const newStats: PlatformStats = { ...(job.platform_stats ?? {}) }
    const errors: Record<string, string> = {}

    // YouTube
    const youtubeVideoId = uploadStatus.youtube?.status === 'success'
        ? uploadStatus.youtube?.video_id
        : null

    if (youtubeVideoId) {
        try {
            newStats.youtube = await fetchYoutubeStats(youtubeVideoId)
        } catch (err) {
            errors.youtube = err instanceof Error ? err.message : 'YouTube stats 조회 실패'
            console.error('[fetch-stats] YouTube 오류:', errors.youtube)
        }
    }

    // Instagram
    const instagramMediaId = uploadStatus.instagram?.status === 'success'
        ? uploadStatus.instagram?.mediaId
        : null

    if (instagramMediaId) {
        try {
            newStats.instagram = await fetchInstagramStats(instagramMediaId)
        } catch (err) {
            errors.instagram = err instanceof Error ? err.message : 'Instagram stats 조회 실패'
            console.error('[fetch-stats] Instagram 오류:', errors.instagram)
        }
    }

    if (!youtubeVideoId && !instagramMediaId) {
        return NextResponse.json(
            { error: 'NO_UPLOADS', message: '업로드된 플랫폼이 없습니다' },
            { status: 422 },
        )
    }

    const { error: updateError } = await supabaseAdmin
        .from('shortform_jobs')
        .update({ platform_stats: newStats })
        .eq('id', jobId)

    if (updateError) {
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: 'platform_stats 저장 실패' },
            { status: 500 },
        )
    }

    return NextResponse.json({
        success: true,
        platform_stats: newStats,
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
    })
}
