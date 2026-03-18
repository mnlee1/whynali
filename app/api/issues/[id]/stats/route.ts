/**
 * app/api/issues/[id]/stats/route.ts
 *
 * [이슈별 통계 API]
 *
 * 특정 이슈의 조회수, 댓글 수, 투표 수, 토론 수를 반환합니다.
 * 이슈 카드와 히어로 캐러셀에서 풍부한 정보를 제공하기 위해 사용됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        // 1. 진행중인 투표 개수
        const { count: voteCount } = await supabaseAdmin
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', id)
            .eq('phase', '진행중')

        // 2. 전체 댓글 수 조회
        const { count: commentCount } = await supabaseAdmin
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', id)
            .eq('visibility', 'public')

        // 3. 진행중인 토론 개수
        const { count: discussionCount } = await supabaseAdmin
            .from('discussion_topics')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', id)
            .eq('approval_status', '진행중')

        // 4. 실제 조회수
        const { data: issueData } = await supabaseAdmin
            .from('issues')
            .select('view_count')
            .eq('id', id)
            .single()

        return NextResponse.json({
            voteCount: voteCount || 0,
            commentCount: commentCount || 0,
            discussionCount: discussionCount || 0,
            viewCount: issueData?.view_count ?? 0,
        })
    } catch (error) {
        console.error('Issue stats fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '통계 조회 실패' },
            { status: 500 }
        )
    }
}
