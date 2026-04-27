import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/* GET /api/admin/discussions?approval_status=&limit=&offset= */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = request.nextUrl
    const approvalStatus = searchParams.get('approval_status')
    const limit = Number(searchParams.get('limit') ?? 50)
    const offset = Number(searchParams.get('offset') ?? 0)

    try {
        let query = supabaseAdmin
            .from('discussion_topics')
            .select('*, issues(id, title, merged_into_id)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (approvalStatus) {
            query = query.eq('approval_status', approvalStatus)
        }

        const { data, error, count } = await query
        if (error) throw error

        // 병합된 이슈에 연결된 토론 제외
        const filtered = (data ?? []).filter(t => !t.issues?.merged_into_id)

        // 의견수(댓글 수) 집계
        const topicIds = filtered.map(t => t.id)
        let commentCountMap: Record<string, number> = {}
        if (topicIds.length > 0) {
            const { data: commentRows } = await supabaseAdmin
                .from('comments')
                .select('discussion_topic_id')
                .in('discussion_topic_id', topicIds)
                .not('visibility', 'in', '(deleted,deleted_by_admin)')
            for (const row of commentRows ?? []) {
                if (row.discussion_topic_id) {
                    commentCountMap[row.discussion_topic_id] = (commentCountMap[row.discussion_topic_id] ?? 0) + 1
                }
            }
        }

        const result = filtered.map(t => ({
            ...t,
            comment_count: commentCountMap[t.id] ?? 0,
        }))

        return NextResponse.json({ data: result, total: count ?? 0 })
    } catch (e) {
        return NextResponse.json({ error: '토론 주제 조회 실패' }, { status: 500 })
    }
}

/* POST /api/admin/discussions — 관리자가 직접 토론 주제 생성 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, content, is_ai_generated = false, approval_status = '대기' } = body

        if (!issue_id || !content?.trim()) {
            return NextResponse.json(
                { error: 'issue_id와 내용이 필요합니다.' },
                { status: 400 }
            )
        }

        const { count: existingCount } = await supabaseAdmin
            .from('discussion_topics')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', issue_id)
            .in('approval_status', ['대기', '진행중'])

        if ((existingCount ?? 0) >= 3) {
            return NextResponse.json(
                { error: '이 이슈에는 이미 토론 주제가 3개 있습니다. 기존 주제를 마감하거나 삭제한 후 생성해주세요.' },
                { status: 422 }
            )
        }

        const validStatuses = ['대기', '승인', '반려', '진행중', '마감']
        if (!validStatuses.includes(approval_status)) {
            return NextResponse.json(
                { error: 'approval_status는 대기|진행중|마감 중 하나여야 합니다.' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('discussion_topics')
            .insert({
                issue_id,
                body: content.trim(),
                is_ai_generated,
                approval_status,
                approved_at: approval_status === '진행중' ? new Date().toISOString() : null,
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (e) {
        return NextResponse.json({ error: '토론 주제 생성 실패' }, { status: 500 })
    }
}
