/**
 * app/api/cron/auto-generate-discussions/route.ts
 *
 * [토론 주제 자동 AI 생성 크론잡]
 *
 * 승인된 이슈 중 활성 토론(대기/진행중)이 없는 이슈를 대상으로
 * AI가 토론 주제 후보를 자동 생성하고 approval_status='대기' 상태로 저장.
 * 관리자 승인 후에만 홈에 노출됨.
 *
 * 실행 주기: 1일 1회 — 매일 12:00 KST (03:00 UTC)
 * GitHub Actions: .github/workflows/cron-auto-generate-discussions.yml
 * 처리 조건: heat_index >= 15, 승인 이슈, 진행중 토론 없는 경우
 * 1회 최대 처리 이슈 수: MAX_ISSUES_PER_RUN (AI API 비용 제어)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import { writeAdminLog } from '@/lib/admin-log'
import type { IssueMetadata } from '@/lib/ai/discussion-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* 1회 실행 시 최대 처리 이슈 수 — AI 비용 제어 */
const MAX_ISSUES_PER_RUN = 5

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const admin = createSupabaseAdminClient()
    let generatedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    try {
        /* 승인된 이슈를 화력 높은 순으로 조회 (여유분 확보) */
        const { data: issues, error: issuesError } = await admin
            .from('issues')
            .select('id, title, category, status, heat_index')
            .eq('approval_status', '승인')
            .gte('heat_index', 15)
            .in('status', ['점화', '논란중'])
            .order('heat_index', { ascending: false })
            .limit(MAX_ISSUES_PER_RUN * 3)

        if (issuesError) throw issuesError

        if (!issues || issues.length === 0) {
            return NextResponse.json({
                success: true,
                generated: 0,
                message: '대상 이슈 없음',
            })
        }

        /* 이미 대기/진행중 토론이 있는 이슈 ID 조회 */
        const issueIds = issues.map((i) => i.id)
        const { data: existingTopics, error: topicsError } = await admin
            .from('discussion_topics')
            .select('issue_id')
            .in('issue_id', issueIds)
            .in('approval_status', ['대기', '진행중'])

        if (topicsError) throw topicsError

        const issuesWithTopics = new Set((existingTopics ?? []).map((t) => t.issue_id))

        /* 활성 토론 없는 이슈만 필터링 후 최대 개수 제한 */
        const targetIssues = issues
            .filter((i) => !issuesWithTopics.has(i.id))
            .slice(0, MAX_ISSUES_PER_RUN)

        if (targetIssues.length === 0) {
            return NextResponse.json({
                success: true,
                generated: 0,
                skipped: issues.length,
                message: '생성 대상 이슈 없음 (모든 이슈에 활성 토론 존재)',
            })
        }

        for (const issue of targetIssues) {
            try {
                const metadata: IssueMetadata = {
                    id: issue.id,
                    title: issue.title,
                    category: issue.category ?? '기타',
                    status: issue.status ?? '점화',
                    heat_index: issue.heat_index ?? undefined,
                }

                const generated = await generateDiscussionTopics(metadata, 1)

                if (generated.length === 0) {
                    skippedCount++
                    continue
                }

                const topic = generated[0]

                /* 토론 주제 저장 */
                const { data: newTopic, error: insertError } = await admin
                    .from('discussion_topics')
                    .insert({
                        issue_id: issue.id,
                        content: topic.content,
                        approval_status: '대기',
                        is_ai_generated: true,
                    })
                    .select()
                    .single()

                if (insertError) throw insertError

                await writeAdminLog('AI 토론 주제 자동 생성', 'discussion_topic', newTopic.id, 'system-cron')
                generatedCount++
            } catch (e) {
                errors.push(`issue(${issue.id}): ${e instanceof Error ? e.message : '생성 실패'}`)
            }
        }

        return NextResponse.json({
            success: true,
            generated: generatedCount,
            skipped: skippedCount,
            errors: errors.length > 0 ? errors : undefined,
            message: `토론 주제 후보 ${generatedCount}개 생성 완료`,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '자동 생성 실패'
        console.error('[auto-generate-discussions]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
