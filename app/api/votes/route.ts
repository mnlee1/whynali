import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

/* GET /api/votes?issue_id=&limit= — 투표 목록 + 선택지 + 현재 사용자 참여 기록 */
export async function GET(request: NextRequest) {
    const issue_id = request.nextUrl.searchParams.get('issue_id')
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 0)

    const admin = createSupabaseAdminClient()
    
    let query = admin
        .from('votes')
        .select('*, vote_choices(*), issues(id, title)')
        .in('phase', ['진행중', '마감'])
        .order('created_at', { ascending: false })

    if (issue_id) {
        query = query.eq('issue_id', issue_id)
    }

    if (limit > 0) {
        query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    /* 로그인 사용자의 투표 기록: { vote_id → vote_choice_id } */
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userVotes: Record<string, string> = {}

    if (user && data && data.length > 0) {
        const { data: uvData } = await admin
            .from('user_votes')
            .select('vote_id, vote_choice_id')
            .eq('user_id', user.id)
            .in('vote_id', data.map((v) => v.id))

        for (const uv of uvData ?? []) {
            userVotes[uv.vote_id] = uv.vote_choice_id
        }
    }

    return NextResponse.json({ data, userVotes })
}
