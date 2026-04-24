/**
 * app/api/admin/migrations/fix-merged-discussion-topics/route.ts
 *
 * [병합된 이슈의 discussion_topics issue_id 정합성 복구]
 *
 * 병합 API 수정 전에 처리된 이슈 병합 건에 대해
 * discussion_topics.issue_id가 여전히 소스(병합됨) 이슈를 가리키는 경우,
 * 타깃 이슈로 일괄 이전합니다.
 *
 * POST { "dryRun": true }  → 이전 대상 미리보기 (실제 수정 없음)
 * POST { "dryRun": false } → 실제 수정 실행
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false

    // 병합됨 처리된 이슈 중 merged_into_id가 있는 것만 조회
    const { data: mergedIssues, error: issueErr } = await supabaseAdmin
        .from('issues')
        .select('id, title, merged_into_id')
        .eq('approval_status', '병합됨')
        .not('merged_into_id', 'is', null)

    if (issueErr) {
        return NextResponse.json({ error: '병합 이슈 조회 실패' }, { status: 500 })
    }

    if (!mergedIssues || mergedIssues.length === 0) {
        return NextResponse.json({ message: '처리 대상 이슈 없음', fixed: 0 })
    }

    const results: { sourceId: string; sourceTitle: string; targetId: string; topicCount: number }[] = []

    for (const issue of mergedIssues) {
        const { data: topics, error: topicErr } = await supabaseAdmin
            .from('discussion_topics')
            .select('id')
            .eq('issue_id', issue.id)

        if (topicErr || !topics || topics.length === 0) continue

        results.push({
            sourceId: issue.id,
            sourceTitle: issue.title,
            targetId: issue.merged_into_id!,
            topicCount: topics.length,
        })

        if (!dryRun) {
            await supabaseAdmin
                .from('discussion_topics')
                .update({ issue_id: issue.merged_into_id })
                .eq('issue_id', issue.id)
        }
    }

    const totalFixed = results.reduce((sum, r) => sum + r.topicCount, 0)

    if (!dryRun && totalFixed > 0) {
        await writeAdminLog(
            '마이그레이션: 병합 토론 정합성 복구',
            'issue',
            'batch',
            auth.adminEmail,
            `${results.length}개 이슈, ${totalFixed}개 토론 이전`
        )
    }

    return NextResponse.json({
        dryRun,
        issueCount: results.length,
        totalTopicsFixed: totalFixed,
        details: results,
    })
}
