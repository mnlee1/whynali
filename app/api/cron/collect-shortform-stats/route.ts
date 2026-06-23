/**
 * app/api/cron/collect-shortform-stats/route.ts
 *
 * [Cron - 매일 KST 오후 12시 실행]
 *
 * YouTube / Instagram에 업로드된 숏폼의 성과 지표를 수집해 platform_stats에 저장.
 * TikTok은 scope 미비로 제외.
 * 최근 업로드 순으로 최대 BATCH_SIZE건 처리 (Vercel 타임아웃 방지).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { fetchYoutubeStats, fetchInstagramStats } from '@/lib/shortform/fetch-platform-stats'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH_SIZE = 50

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

    // upload_status가 있는 job 전체 조회 후 JS에서 필터링
    // (Supabase JSONB .or() 연산자가 불안정하므로 안전한 방식 사용)
    const { data: allJobs, error } = await supabaseAdmin
        .from('shortform_jobs')
        .select('id, issue_title, upload_status, platform_stats')
        .not('upload_status', 'is', null)
        .order('created_at', { ascending: false })
        .limit(BATCH_SIZE * 3)

    if (error) {
        console.error('[collect-shortform-stats] job 조회 실패:', error)
        return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 })
    }

    // YouTube 또는 Instagram 업로드 성공한 job만 필터링
    const jobs = (allJobs ?? [])
        .filter(job => {
            const us = job.upload_status as any
            return us?.youtube?.status === 'success' || us?.instagram?.status === 'success'
        })
        .slice(0, BATCH_SIZE)

    if (jobs.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: '업로드된 job 없음' })
    }

    // job 수에 따라 동시 처리 수 동적 결정
    // 적을수록 빠르게, 많을수록 타임아웃 안전하게
    const concurrency =
        jobs.length <= 10 ? jobs.length :  // 전부 동시
        jobs.length <= 25 ? 10 :           // 10개씩
        5                                   // 5개씩 (안전)

    console.log(`[collect-shortform-stats] ${jobs.length}건 처리 시작 (동시처리: ${concurrency})`)

    let succeeded = 0
    let failed = 0
    const failures: { id: string; error: string }[] = []

    for (let i = 0; i < jobs.length; i += concurrency) {
        const chunk = jobs.slice(i, i + concurrency)

        await Promise.all(chunk.map(async (job) => {
            const uploadStatus = (job.upload_status ?? {}) as Record<string, any>
            const currentStats = (job.platform_stats ?? {}) as Record<string, any>
            const newStats = { ...currentStats }
            let updated = false

            // YouTube + Instagram 동시 처리
            await Promise.all([
                // YouTube
                (async () => {
                    const videoId = uploadStatus.youtube?.status === 'success'
                        ? uploadStatus.youtube?.video_id
                        : null
                    if (!videoId) return
                    try {
                        newStats.youtube = await fetchYoutubeStats(videoId)
                        updated = true
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'YouTube stats 실패'
                        console.error(`[collect-shortform-stats] YouTube 오류 (${job.id}):`, msg)
                        failures.push({ id: job.id, error: `youtube: ${msg}` })
                    }
                })(),
                // Instagram
                (async () => {
                    const mediaId = uploadStatus.instagram?.status === 'success'
                        ? uploadStatus.instagram?.mediaId
                        : null
                    if (!mediaId) return
                    try {
                        newStats.instagram = await fetchInstagramStats(mediaId)
                        updated = true
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Instagram stats 실패'
                        console.error(`[collect-shortform-stats] Instagram 오류 (${job.id}):`, msg)
                        failures.push({ id: job.id, error: `instagram: ${msg}` })
                    }
                })(),
            ])

            if (updated) {
                const { error: updateError } = await supabaseAdmin
                    .from('shortform_jobs')
                    .update({ platform_stats: newStats })
                    .eq('id', job.id)

                if (updateError) {
                    console.error(`[collect-shortform-stats] DB 업데이트 실패 (${job.id}):`, updateError)
                    failed++
                } else {
                    succeeded++
                }
            }
        }))
    }

    console.log(`[collect-shortform-stats] 완료: 성공 ${succeeded}건, 실패 ${failed}건`)

    return NextResponse.json({
        success: true,
        total: jobs.length,
        succeeded,
        failed,
        ...(failures.length > 0 ? { failures } : {}),
    })
}
