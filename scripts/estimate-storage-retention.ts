/**
 * scripts/estimate-storage-retention.ts
 *
 * Storage 자동삭제 기능 설계용 — shortform/longform 버킷 실제 사용량과
 * job 생성 속도를 바탕으로 "생성 후 N일 지나면 Storage만 삭제" 정책의
 * N을 얼마로 잡아야 안전한지 추정한다. 일회성 조사 스크립트.
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

const FREE_TIER_LIMIT_BYTES = 1 * 1024 * 1024 * 1024 // Supabase 무료 플랜 Storage 한도 가정치(1GB)

async function listAllFiles(bucket: string): Promise<{ name: string; size: number }[]> {
    const all: { name: string; size: number }[] = []
    let offset = 0
    const limit = 1000
    for (;;) {
        const { data, error } = await supabaseAdmin.storage.from(bucket).list('', {
            limit,
            offset,
            sortBy: { column: 'created_at', order: 'asc' },
        })
        if (error) {
            console.error(`[${bucket}] list 실패:`, error.message)
            break
        }
        if (!data || data.length === 0) break
        for (const f of data) {
            const size = (f.metadata as any)?.size ?? 0
            if (f.id) all.push({ name: f.name, size })
        }
        if (data.length < limit) break
        offset += limit
    }
    return all
}

function fmtMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

async function main() {
    console.log('=== Storage 사용량 + job 생성 속도 조사 ===\n')

    for (const bucket of ['shortform', 'longform']) {
        const files = await listAllFiles(bucket)
        const totalBytes = files.reduce((s, f) => s + f.size, 0)
        const avgBytes = files.length > 0 ? totalBytes / files.length : 0
        console.log(`[버킷: ${bucket}]`)
        console.log(`  파일 수: ${files.length}개`)
        console.log(`  총 용량: ${fmtMB(totalBytes)}`)
        console.log(`  평균 파일 크기: ${fmtMB(avgBytes)}`)
        console.log('')
    }

    // shortform_jobs 생성 속도 (video_path 있는 것만 = 실제 영상 존재)
    const { data: sfJobs, error: sfErr } = await supabaseAdmin
        .from('shortform_jobs')
        .select('created_at, video_path')
        .not('video_path', 'is', null)
        .order('created_at', { ascending: true })

    if (sfErr) {
        console.error('shortform_jobs 조회 실패:', sfErr.message)
    } else if (sfJobs && sfJobs.length > 0) {
        const first = new Date(sfJobs[0].created_at)
        const last = new Date(sfJobs[sfJobs.length - 1].created_at)
        const spanDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24))
        const perDay = sfJobs.length / spanDays
        console.log('[숏폼 job 생성 속도]')
        console.log(`  영상 있는 job 수: ${sfJobs.length}개`)
        console.log(`  기간: ${first.toISOString().slice(0, 10)} ~ ${last.toISOString().slice(0, 10)} (${spanDays.toFixed(1)}일)`)
        console.log(`  일 평균 생성 수: ${perDay.toFixed(2)}개/일`)
        console.log('')
    }

    const { data: lfJobs, error: lfErr } = await supabaseAdmin
        .from('longform_jobs')
        .select('created_at, video_path')
        .not('video_path', 'is', null)
        .order('created_at', { ascending: true })

    if (lfErr) {
        console.error('longform_jobs 조회 실패:', lfErr.message)
    } else if (lfJobs && lfJobs.length > 0) {
        const first = new Date(lfJobs[0].created_at)
        const last = new Date(lfJobs[lfJobs.length - 1].created_at)
        const spanDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24))
        const perDay = lfJobs.length / spanDays
        console.log('[롱폼 job 생성 속도]')
        console.log(`  영상 있는 job 수: ${lfJobs.length}개`)
        console.log(`  기간: ${first.toISOString().slice(0, 10)} ~ ${last.toISOString().slice(0, 10)} (${spanDays.toFixed(1)}일)`)
        console.log(`  일 평균 생성 수: ${perDay.toFixed(2)}개/일`)
        console.log('')
    } else {
        console.log('[롱폼 job 생성 속도] 데이터 없음 (아직 생성된 롱폼 없음)\n')
    }

    console.log(`가정: Storage 한도 ${fmtMB(FREE_TIER_LIMIT_BYTES)} (무료 플랜)`)
}

main().catch(e => {
    console.error('스크립트 실행 실패:', e)
    process.exit(1)
})
