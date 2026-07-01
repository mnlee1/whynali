/**
 * app/api/cron/auto-bot-comment/route.ts
 *
 * [봇 댓글 자동 생성 Cron]
 *
 * 세 가지 모드:
 * - 배치 모드 (GET, 파라미터 없음): 이슈 + 토론 모두 배치 실행
 * - 단일 이슈 모드 (GET ?issue_id=xxx): 특정 이슈에 즉시 댓글 1개 달기
 * - 단일 토론 모드 (GET ?discussion_topic_id=xxx): 특정 토론에 즉시 의견 1개 달기
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { runBotCommentBatch, postBotComment, runBotDiscussionCommentBatch, postBotDiscussionComment } from '@/lib/bot/bot-commenter'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const issueId = request.nextUrl.searchParams.get('issue_id')
    const discussionTopicId = request.nextUrl.searchParams.get('discussion_topic_id')

    try {
        if (issueId) {
            const ok = await postBotComment(issueId)
            return NextResponse.json({ ok, issue_id: issueId })
        }

        if (discussionTopicId) {
            const ok = await postBotDiscussionComment(discussionTopicId)
            return NextResponse.json({ ok, discussion_topic_id: discussionTopicId })
        }

        // 배치 모드: 이슈 + 토론 동시 실행
        const [issueResult, discussionResult] = await Promise.all([
            runBotCommentBatch(),
            runBotDiscussionCommentBatch(),
        ])
        return NextResponse.json({
            ok: true,
            issues: issueResult,
            discussions: discussionResult,
        })
    } catch (err) {
        console.error('[auto-bot-comment] 오류:', err)
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        )
    }
}
