/**
 * app/api/admin/migrations/generate-timeline-summaries/route.ts
 *
 * 기존 이슈의 timeline_points로 timeline_summaries + brief_summary 일괄 생성
 *
 * 사용법:
 *   POST /api/admin/migrations/generate-timeline-summaries
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateSummariesForIssue } from '@/lib/pipeline/backfill-brief-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const force = searchParams.get('force') === 'true'
        const limit = parseInt(searchParams.get('limit') ?? '20', 10)
        const offset = parseInt(searchParams.get('offset') ?? '0', 10)

        let issues: Array<{ id: string; title: string }>

        if (force) {
            // force=true: limit/offset으로 배치 처리
            const { data } = await supabaseAdmin
                .from('issues')
                .select('id, title')
                .in('approval_status', ['승인', '대기'])
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)
            issues = data ?? []
        } else {
            // force=false: 미생성 이슈만 조회
            const { data } = await supabaseAdmin
                .rpc('get_issues_without_summaries', { limit_count: limit })
            issues = data ?? []
        }

        if (issues.length === 0) {
            return NextResponse.json({ success: true, message: '처리할 이슈 없음', hasMore: false })
        }

        const targets = issues
        console.log(`[generate-timeline-summaries] 대상: ${targets.length}건 offset=${offset} ${force ? '(재생성 모드)' : '(미생성 이슈만)'}`)

        let successCount = 0
        let skippedCount = 0
        let errorCount = 0
        const failedIssues: Array<{ title: string; error: string }> = []

        for (const issue of targets) {
            try {
                const count = await generateSummariesForIssue(issue.id, issue.title)
                if (count > 0) {
                    console.log(`  ✓ ${issue.title}: ${count}개 단계`)
                    successCount++
                } else {
                    skippedCount++
                }
            } catch (error) {
                errorCount++
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.warn(`  ⚠️ [이슈 처리 실패] ${issue.title}: ${errorMessage}`)
                failedIssues.push({ title: issue.title, error: errorMessage })
            }
            await new Promise(resolve => setTimeout(resolve, 800))
        }

        return NextResponse.json({
            success: true,
            processed: successCount,
            skipped: skippedCount,
            errors: errorCount,
            offset,
            limit,
            hasMore: force ? issues.length === limit : false,
            failedIssues: failedIssues.length > 0 ? failedIssues : undefined,
            message: `[offset ${offset}] ${successCount}개 이슈 요약 생성 완료${errorCount > 0 ? `, ${errorCount}개 실패` : ''}`,
        })
    } catch (error) {
        console.error('[generate-timeline-summaries] 에러:', error)
        return NextResponse.json(
            { error: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        )
    }
}
