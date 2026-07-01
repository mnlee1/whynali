/**
 * app/api/cron/auto-bot-comment/route.ts
 *
 * [봇 댓글 자동 생성 Cron]
 *
 * 두 가지 모드:
 * - 배치 모드 (GET, 파라미터 없음): 봇 댓글이 적은 활성 이슈 최대 5개에 댓글 달기
 * - 단일 모드 (GET ?issue_id=xxx): 특정 이슈에 즉시 댓글 1개 달기 (이슈 승인 후 즉시 호출)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { runBotCommentBatch, postBotComment } from '@/lib/bot/bot-commenter'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    const issueId = request.nextUrl.searchParams.get('issue_id')

    try {
        if (issueId) {
            // 단일 모드: 이슈 승인 직후 즉시 댓글 달기
            const ok = await postBotComment(issueId)
            return NextResponse.json({ ok, issue_id: issueId })
        }

        // 배치 모드
        const result = await runBotCommentBatch()
        return NextResponse.json({ ok: true, ...result })
    } catch (err) {
        console.error('[auto-bot-comment] 오류:', err)
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        )
    }
}
