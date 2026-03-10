/**
 * app/api/cron/auto-generate-votes/route.ts
 *
 * [투표 자동 AI 생성 크론잡]
 *
 * 승인된 이슈 중 활성 투표(대기/진행중)가 없는 이슈를 대상으로
 * AI가 투표 후보를 자동 생성하고 phase='대기' / approval_status='대기' 상태로 저장.
 * 관리자 승인 후에만 홈에 노출됨.
 *
 * 실행 주기: 1일 1회 — 매일 00:00 UTC / 오전 9시 KST
 * GitHub Actions: .github/workflows/cron-auto-generate-votes.yml
 * 1회 최대 처리 이슈 수: MAX_ISSUES_PER_RUN (AI API 비용 제어)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { generateVoteOptions } from '@/lib/ai/vote-generator'
import { writeAdminLog } from '@/lib/admin-log'
import type { IssueMetadata } from '@/lib/ai/vote-generator'

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
            .order('heat_index', { ascending: false })
            .limit(MAX_ISSUES_PER_RUN * 3)

        if (issuesError) throw issuesError

        if (!issues || issues.length === 0) {
            return NextResponse.json({
                success: true,
                generatedCount: 0,
                message: '대상 이슈 없음',
            })
        }

        /* 이미 대기/진행중 투표가 있는 이슈 ID 조회 */
        const issueIds = issues.map((i) => i.id)
        const { data: existingVotes, error: votesError } = await admin
            .from('votes')
            .select('issue_id')
            .in('issue_id', issueIds)
            .in('phase', ['대기', '진행중'])

        if (votesError) throw votesError

        const issuesWithVotes = new Set((existingVotes ?? []).map((v) => v.issue_id))

        /* 활성 투표 없는 이슈만 필터링 후 최대 개수 제한 */
        const targetIssues = issues
            .filter((i) => !issuesWithVotes.has(i.id))
            .slice(0, MAX_ISSUES_PER_RUN)

        if (targetIssues.length === 0) {
            return NextResponse.json({
                success: true,
                generatedCount: 0,
                message: '생성 대상 이슈 없음 (모든 이슈에 활성 투표 존재)',
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

                const generated = await generateVoteOptions(metadata, 1)

                if (generated.length === 0) {
                    skippedCount++
                    continue
                }

                const vote = generated[0]

                /* 투표 저장 */
                const { data: newVote, error: insertVoteError } = await admin
                    .from('votes')
                    .insert({
                        issue_id: issue.id,
                        title: vote.title,
                        phase: '대기',
                        approval_status: '대기',
                        issue_status_snapshot: issue.status,
                    })
                    .select()
                    .single()

                if (insertVoteError) throw insertVoteError

                /* 선택지 저장 */
                const choiceRows = vote.choices.map((label) => ({
                    vote_id: newVote.id,
                    label,
                    count: 0,
                }))

                const { error: insertChoicesError } = await admin
                    .from('vote_choices')
                    .insert(choiceRows)

                if (insertChoicesError) {
                    /* 선택지 실패 시 투표도 롤백 */
                    await admin.from('votes').delete().eq('id', newVote.id)
                    throw insertChoicesError
                }

                await writeAdminLog('AI 투표 자동 생성', 'vote', newVote.id, 'system-cron')
                generatedCount++
            } catch (e) {
                errors.push(`issue(${issue.id}): ${e instanceof Error ? e.message : '생성 실패'}`)
            }
        }

        return NextResponse.json({
            success: true,
            generatedCount,
            skippedCount,
            errors: errors.length > 0 ? errors : undefined,
            message: `${generatedCount}개 투표 자동 생성 완료`,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : '자동 생성 실패'
        console.error('[auto-generate-votes]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
