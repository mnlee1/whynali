/**
 * app/api/admin/migrations/deduplicate-timeline/route.ts
 *
 * [타임라인 중복 포인트 정리 마이그레이션]
 *
 * 기존 이슈의 timeline_points 중 제목이 유사한 중복 포인트를 삭제합니다.
 * update-timeline cron의 isSimilarTitle 로직과 동일 기준 사용.
 *
 * 사용법:
 *   POST /api/admin/migrations/deduplicate-timeline
 *   { "dryRun": true }  → 실제 삭제 없이 예상 결과만 확인
 *   { "dryRun": false } → 실제 삭제 실행
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAdminRequest(request: NextRequest): boolean {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) ?? []
    const authHeader = request.headers.get('x-admin-email')
    return adminEmails.length > 0 && authHeader !== null && adminEmails.includes(authHeader)
}

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '까지', '부터', '에서', '에게', '한테', '한', '하는', '하고', '하여', '해서',
    '이다', '있다', '없다', '하다', '되다', '이고', '하며', '에도', '으로도', '이라', '라',
    '것', '수', '등', '및', '또', '그', '더', '이후', '앞서', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '내일', '어제', '해당', '기자',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

function isSimilarTitle(newTitle: string, existingTitles: string[]): boolean {
    const newKeywords = extractKeywords(newTitle)
    if (newKeywords.size === 0) return false

    for (const existing of existingTitles) {
        const existingKeywords = extractKeywords(existing)
        let overlap = 0
        for (const kw of newKeywords) {
            if (existingKeywords.has(kw)) overlap++
        }
        if (overlap >= 3) return true
    }
    return false
}

export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun !== false // 기본값 true (안전)

    try {
        console.log(`[deduplicate-timeline] 시작 (dryRun: ${dryRun})`)

        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .order('created_at', { ascending: false })
            .limit(500)

        if (!issues || issues.length === 0) {
            return NextResponse.json({ success: true, message: '처리할 이슈 없음', dryRun })
        }

        let totalDeleted = 0
        let processedIssues = 0
        const preview: Array<{ issueTitle: string; kept: number; deleted: number }> = []

        for (const issue of issues) {
            const { data: points } = await supabaseAdmin
                .from('timeline_points')
                .select('id, title, occurred_at')
                .eq('issue_id', issue.id)
                .order('occurred_at', { ascending: true })

            if (!points || points.length <= 1) continue

            const keepIds: string[] = []
            const deleteIds: string[] = []
            const seenTitles: string[] = []

            for (const point of points) {
                if (!point.title || !isSimilarTitle(point.title, seenTitles)) {
                    keepIds.push(point.id)
                    if (point.title) seenTitles.push(point.title)
                } else {
                    deleteIds.push(point.id)
                }
            }

            if (deleteIds.length === 0) continue

            console.log(`  [${issue.title}] 삭제 대상: ${deleteIds.length}건 / 유지: ${keepIds.length}건`)

            if (!dryRun) {
                const { error } = await supabaseAdmin
                    .from('timeline_points')
                    .delete()
                    .in('id', deleteIds)

                if (error) {
                    console.error(`  ❌ 삭제 실패: ${issue.title} — ${error.message}`)
                    continue
                }
            }

            totalDeleted += deleteIds.length
            processedIssues++
            if (dryRun) {
                preview.push({ issueTitle: issue.title, kept: keepIds.length, deleted: deleteIds.length })
            }
        }

        console.log(`[deduplicate-timeline] 완료 — 처리 이슈: ${processedIssues}, 삭제: ${totalDeleted}건`)

        return NextResponse.json({
            success: true,
            dryRun,
            processedIssues,
            totalDeleted,
            ...(dryRun ? { preview } : {}),
            message: dryRun
                ? `dryRun 완료 — 실제 삭제하려면 { "dryRun": false }로 재요청`
                : `중복 포인트 ${totalDeleted}건 삭제 완료`,
        })
    } catch (error) {
        console.error('[deduplicate-timeline] 에러:', error)
        return NextResponse.json(
            { error: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        )
    }
}
