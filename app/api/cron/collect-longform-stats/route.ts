/**
 * app/api/cron/collect-longform-stats/route.ts
 *
 * [Cron - 매일 실행]
 *
 * YouTube에 업로드된 롱폼(옴니버스)의 성과 지표를 수집해 저장.
 * 롱폼은 인스타그램 업로드가 없어 유튜브만 처리한다.
 * longform_jobs에는 platform_stats 컬럼이 없어(마이그레이션 없이),
 * 기존 upload_status.chapters와 같은 방식으로 upload_status.stats에 얹어 저장한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { fetchYoutubeStats } from '@/lib/shortform/fetch-platform-stats'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 30

function verifyCronRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return false
    return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
    if (!verifyCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: allJobs, error } = await supabaseAdmin
        .from('longform_jobs')
        .select('id, source_titles, upload_status')
        .not('upload_status', 'is', null)
        .order('created_at', { ascending: false })
        .limit(BATCH_SIZE * 3)

    if (error) {
        console.error('[collect-longform-stats] job 조회 실패:', error)
        return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 })
    }

    const jobs = (allJobs ?? [])
        .filter(job => (job.upload_status as any)?.youtube?.status === 'success')
        .slice(0, BATCH_SIZE)

    if (jobs.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: '업로드된 롱폼 없음' })
    }

    console.log(`[collect-longform-stats] ${jobs.length}건 처리 시작`)

    let succeeded = 0
    let failed = 0
    const failures: { id: string; error: string }[] = []

    const concurrency = jobs.length <= 10 ? jobs.length : 5

    for (let i = 0; i < jobs.length; i += concurrency) {
        const chunk = jobs.slice(i, i + concurrency)

        await Promise.all(chunk.map(async (job) => {
            const uploadStatus = (job.upload_status ?? {}) as Record<string, any>
            const videoId = uploadStatus.youtube?.video_id
            if (!videoId) return

            try {
                const youtubeStats = await fetchYoutubeStats(videoId)
                const newUploadStatus = {
                    ...uploadStatus,
                    stats: { ...(uploadStatus.stats ?? {}), youtube: youtubeStats },
                }

                const { error: updateError } = await supabaseAdmin
                    .from('longform_jobs')
                    .update({ upload_status: newUploadStatus })
                    .eq('id', job.id)

                if (updateError) {
                    console.error(`[collect-longform-stats] DB 업데이트 실패 (${job.id}):`, updateError)
                    failed++
                } else {
                    succeeded++
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'YouTube stats 실패'
                console.error(`[collect-longform-stats] YouTube 오류 (${job.id}):`, msg)
                failures.push({ id: job.id, error: msg })
                failed++
            }
        }))
    }

    console.log(`[collect-longform-stats] 완료: 성공 ${succeeded}건, 실패 ${failed}건`)

    return NextResponse.json({
        success: true,
        total: jobs.length,
        succeeded,
        failed,
        ...(failures.length > 0 ? { failures } : {}),
    })
}
