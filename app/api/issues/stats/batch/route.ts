/**
 * app/api/issues/stats/batch/route.ts
 *
 * [이슈 통계 배치 조회 API]
 *
 * 여러 이슈의 통계를 한 번에 조회합니다.
 * 쿼리 파라미터: ?ids=id1,id2,...  (최대 50개)
 * 응답: { [issueId]: { viewCount, commentCount, voteCount, discussionCount } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'icn1'

export async function GET(request: NextRequest) {
    const raw = request.nextUrl.searchParams.get('ids') ?? ''
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean)

    if (ids.length === 0) return NextResponse.json({})
    if (ids.length > 50) {
        return NextResponse.json({ error: 'TOO_MANY_IDS', message: '최대 50개까지 조회 가능합니다.' }, { status: 400 })
    }

    try {
        const [
            { data: votesData },
            { data: commentsData },
            { data: discussionsData },
            { data: issuesData },
        ] = await Promise.all([
            supabaseAdmin
                .from('votes')
                .select('issue_id')
                .in('issue_id', ids)
                .in('phase', ['진행중', '마감']),
            supabaseAdmin
                .from('comments')
                .select('issue_id')
                .in('issue_id', ids)
                .is('parent_id', null)
                .in('visibility', ['public', 'pending_review']),
            supabaseAdmin
                .from('discussion_topics')
                .select('issue_id')
                .in('issue_id', ids)
                .in('approval_status', ['진행중', '마감']),
            supabaseAdmin
                .from('issues')
                .select('id, view_count')
                .in('id', ids),
        ])

        const countById = (data: Array<{ issue_id: string }> | null) =>
            (data ?? []).reduce<Record<string, number>>((acc, row) => {
                acc[row.issue_id] = (acc[row.issue_id] ?? 0) + 1
                return acc
            }, {})

        const voteCounts = countById(votesData)
        const commentCounts = countById(commentsData)
        const discussionCounts = countById(discussionsData)
        const viewCountMap = Object.fromEntries(
            (issuesData ?? []).map(i => [i.id, i.view_count ?? 0])
        )

        const result = Object.fromEntries(
            ids.map(id => [id, {
                voteCount: voteCounts[id] ?? 0,
                commentCount: commentCounts[id] ?? 0,
                discussionCount: discussionCounts[id] ?? 0,
                viewCount: viewCountMap[id] ?? 0,
            }])
        )

        return NextResponse.json(result)
    } catch (error) {
        console.error('Batch stats fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '통계 배치 조회 실패' },
            { status: 500 }
        )
    }
}
