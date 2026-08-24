/**
 * app/api/comments/popular/route.ts
 *
 * [인기 댓글 API]
 * 같은 카테고리(category) 내에서 좋아요 많은 댓글 상위 N개를 반환.
 * 전역(카테고리 무관)으로 하면 지금 보는 이슈와 아무 연관 없는 댓글이 나와서
 * "왜 여기 있는지" 맥락이 없어짐 → 카테고리로 관련성을 준다.
 *
 * 안전장치:
 * - visibility='public'만 (세이프티봇 보류/삭제 제외)
 * - reports 테이블에 신고 기록이 있는 댓글은 무조건 제외(신고 처리 상태 무관)
 * - 연결된 이슈가 승인/visible 상태가 아니면 제외
 * - 캐싱 없이 매번 실시간 조회 (댓글 삭제/수정이 즉시 반영되도록 - 페이지 ISR과 별도)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'icn1'

function authorLabel(comment: { display_name?: string | null; user_id: string }): string {
    if (comment.display_name?.trim()) return comment.display_name.trim()
    return `사용자 …${comment.user_id.slice(-4)}`
}

export async function GET(request: NextRequest) {
    const excludeIssueId = request.nextUrl.searchParams.get('exclude_issue_id')
    const category = request.nextUrl.searchParams.get('category')
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 5)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 5

    if (!category) {
        return NextResponse.json({ error: 'CATEGORY_REQUIRED' }, { status: 400 })
    }

    let commentsQuery = supabaseAdmin
        .from('comments')
        .select('id, body, user_id, issue_id, created_at, like_count, users(display_name), issues!inner(title, category, approval_status, visibility_status)')
        .eq('visibility', 'public')
        .not('issue_id', 'is', null)
        .eq('issues.category', category)
        .eq('issues.approval_status', '승인')
        .eq('issues.visibility_status', 'visible')
        .order('like_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)

    if (excludeIssueId) {
        commentsQuery = commentsQuery.neq('issue_id', excludeIssueId)
    }

    /* 신고 여부 조회를 후보 id 확정 후 순차 실행하지 않고, 전체 신고 목록을 병렬로 미리 가져와 왕복 1회로 줄임
       (reports 테이블은 comments보다 훨씬 작아서 전체를 가져와도 부담 적음) */
    const [{ data: comments, error }, { data: reportedRows, error: reportsError }] = await Promise.all([
        commentsQuery,
        supabaseAdmin.from('reports').select('comment_id'),
    ])

    if (error) {
        console.error('[comments/popular] 조회 오류:', error.message)
        return NextResponse.json({ error: 'FETCH_ERROR' }, { status: 500 })
    }

    /* 신고 목록 조회가 실패하면 신고된 댓글을 걸러낼 방법이 없으므로,
       fail-open(빈 배열로 간주하고 진행) 대신 fail-closed(아무것도 반환하지 않음)로 처리 */
    if (reportsError) {
        console.error('[comments/popular] 신고 목록 조회 오류:', reportsError.message)
        return NextResponse.json({ data: [] })
    }

    const reportedIds = new Set((reportedRows ?? []).map((r) => r.comment_id))

    const safeComments = (comments ?? [])
        .filter((c) => !reportedIds.has(c.id))
        .slice(0, limit)
        .map((c) => ({
            id: c.id,
            body: c.body,
            authorLabel: authorLabel({ display_name: (c as any).users?.display_name ?? null, user_id: c.user_id }),
            issueId: c.issue_id as string,
            issueTitle: (c as any).issues?.title ?? '',
            createdAt: c.created_at,
        }))

    return NextResponse.json({ data: safeComments })
}
