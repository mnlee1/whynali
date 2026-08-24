/**
 * app/api/cron/cleanup-old-storage/route.ts
 *
 * [Cron - 매주 1회 실행]
 *
 * Storage 용량 관리 — 생성된 지 STORAGE_CLEANUP_RETENTION_DAYS일(기본 90일)이 지난
 * 숏폼/롱폼 job의 Storage 영상 파일만 삭제한다. DB row는 절대 삭제하지 않고
 * video_path만 null 처리 (app/api/admin/shortform/[id]/delete-storage/route.ts와 동일 패턴).
 *
 * 안전장치 — 다음 조건을 만족하는 job만 정리 대상:
 *   - 숏폼: approval_status='rejected' (애초에 쓸 일 없는 영상) 이거나,
 *           유튜브/인스타/틱톡 중 하나라도 업로드 성공(upload_status.<platform>.status==='success')
 *   - 롱폼: 유튜브 업로드 성공(upload_status.youtube.status==='success')
 * 위 조건을 만족하지 않으면(아직 어디에도 못 올린 영상) 90일이 지나도 건드리지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETENTION_DAYS = parseInt(process.env.STORAGE_CLEANUP_RETENTION_DAYS ?? '90', 10)

function verifyCronRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return false
    return authHeader === `Bearer ${cronSecret}`
}

function hasSuccessfulUpload(uploadStatus: any): boolean {
    return ['youtube', 'instagram', 'tiktok'].some(p => uploadStatus?.[p]?.status === 'success')
}

async function cleanupShortform(cutoff: string): Promise<{ cleaned: number; freedBytes: number }> {
    const { data: jobs, error } = await supabaseAdmin
        .from('shortform_jobs')
        .select('id, issue_title, video_path, approval_status, upload_status')
        .not('video_path', 'is', null)
        .lt('created_at', cutoff)

    if (error) {
        console.error('[cleanup-old-storage] 숏폼 조회 실패:', error)
        return { cleaned: 0, freedBytes: 0 }
    }

    let cleaned = 0
    let freedBytes = 0

    for (const job of jobs ?? []) {
        const safe = job.approval_status === 'rejected' || hasSuccessfulUpload(job.upload_status)
        if (!safe) continue

        const removePaths = [job.video_path as string]
        const thumbnailPath = (job.upload_status as any)?.thumbnail_path
        if (thumbnailPath) removePaths.push(thumbnailPath)

        const { data: sizeData } = await supabaseAdmin.storage.from('shortform').list('', { search: (job.video_path as string).split('/').pop() })
        const fileSize = sizeData?.[0]?.metadata?.size ?? 0

        const { error: removeError } = await supabaseAdmin.storage.from('shortform').remove(removePaths)
        if (removeError) {
            console.warn(`[cleanup-old-storage] 숏폼 Storage 삭제 실패 (${job.id}):`, removeError.message)
            continue
        }

        const newUploadStatus = { ...(job.upload_status || {}) }
        delete newUploadStatus.thumbnail_path

        await supabaseAdmin
            .from('shortform_jobs')
            .update({ video_path: null, upload_status: newUploadStatus })
            .eq('id', job.id)

        cleaned++
        freedBytes += fileSize
        console.log(`  ✓ [숏폼 정리] "${job.issue_title}" (${job.id})`)
    }

    return { cleaned, freedBytes }
}

async function cleanupLongform(cutoff: string): Promise<{ cleaned: number; freedBytes: number }> {
    const { data: jobs, error } = await supabaseAdmin
        .from('longform_jobs')
        .select('id, source_titles, video_path, upload_status')
        .not('video_path', 'is', null)
        .lt('created_at', cutoff)

    if (error) {
        console.error('[cleanup-old-storage] 롱폼 조회 실패:', error)
        return { cleaned: 0, freedBytes: 0 }
    }

    let cleaned = 0
    let freedBytes = 0

    for (const job of jobs ?? []) {
        const safe = (job.upload_status as any)?.youtube?.status === 'success'
        if (!safe) continue

        const { data: sizeData } = await supabaseAdmin.storage.from('longform').list('', { search: (job.video_path as string).split('/').pop() })
        const fileSize = sizeData?.[0]?.metadata?.size ?? 0

        const { error: removeError } = await supabaseAdmin.storage.from('longform').remove([job.video_path as string])
        if (removeError) {
            console.warn(`[cleanup-old-storage] 롱폼 Storage 삭제 실패 (${job.id}):`, removeError.message)
            continue
        }

        await supabaseAdmin
            .from('longform_jobs')
            .update({ video_path: null })
            .eq('id', job.id)

        cleaned++
        freedBytes += fileSize
        console.log(`  ✓ [롱폼 정리] "${(job.source_titles ?? []).join(' → ')}" (${job.id})`)
    }

    return { cleaned, freedBytes }
}

export async function GET(request: NextRequest) {
    if (!verifyCronRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [shortformResult, longformResult] = await Promise.all([
        cleanupShortform(cutoff),
        cleanupLongform(cutoff),
    ])

    const totalCleaned = shortformResult.cleaned + longformResult.cleaned
    const totalFreedMB = ((shortformResult.freedBytes + longformResult.freedBytes) / (1024 * 1024)).toFixed(1)

    console.log(`[cleanup-old-storage] 완료 — 숏폼 ${shortformResult.cleaned}개, 롱폼 ${longformResult.cleaned}개, 약 ${totalFreedMB}MB 확보`)

    if (totalCleaned > 0) {
        await writeAdminLog(
            'Storage 자동 정리',
            'storage_cleanup',
            null,
            'cron:cleanup-old-storage',
            `숏폼 ${shortformResult.cleaned}개, 롱폼 ${longformResult.cleaned}개 정리, 약 ${totalFreedMB}MB 확보 (${RETENTION_DAYS}일 이상 경과 + 업로드 완료분만)`
        )
    }

    return NextResponse.json({
        success: true,
        retentionDays: RETENTION_DAYS,
        shortformCleaned: shortformResult.cleaned,
        longformCleaned: longformResult.cleaned,
        freedMB: totalFreedMB,
    })
}
