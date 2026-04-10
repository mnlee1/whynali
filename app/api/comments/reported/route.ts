import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/* GET /api/comments/reported?issue_id=...&discussion_topic_id=... — 내가 신고한 댓글 ID 목록 */
export async function GET(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ data: [] })
    }

    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issue_id')
    const discussionTopicId = searchParams.get('discussion_topic_id')

    if (!issueId && !discussionTopicId) {
        return NextResponse.json({ data: [] })
    }

    /* 현재 컨텍스트의 댓글 ID 목록 조회 */
    let commentQuery = supabaseAdmin
        .from('comments')
        .select('id')
        .neq('visibility', 'deleted')

    if (issueId) commentQuery = commentQuery.eq('issue_id', issueId)
    else if (discussionTopicId) commentQuery = commentQuery.eq('discussion_topic_id', discussionTopicId)

    const { data: comments } = await commentQuery
    if (!comments || comments.length === 0) return NextResponse.json({ data: [] })

    const commentIds = comments.map((c) => c.id)

    /* 내가 신고한 항목 필터 */
    const { data: reports } = await supabaseAdmin
        .from('reports')
        .select('comment_id')
        .eq('reporter_id', user.id)
        .in('comment_id', commentIds)

    const reportedIds = reports?.map((r) => r.comment_id) ?? []

    return NextResponse.json({ data: reportedIds })
}
