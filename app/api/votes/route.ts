import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

export const preferredRegion = 'icn1'

/* GET /api/votes?issue_id=&limit= — 투표 목록 + 선택지 + 현재 사용자 참여 기록 */
export async function GET(request: NextRequest) {
    const issue_id = request.nextUrl.searchParams.get('issue_id')
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 0)

    const admin = createSupabaseAdminClient()
    
    let query = admin
        .from('votes')
        .select('*, vote_choices(*), issues(id, title, approval_status, visibility_status)')
        .in('phase', ['진행중', '마감'])
        .eq('approval_status', '승인')
        .order('created_at', { ascending: false })

    if (issue_id) {
        query = query.eq('issue_id', issue_id)
    }

    if (limit > 0) {
        query = query.limit(limit)
    }

    const { data: rawData, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    /* issue_id가 있는 투표는 연결된 이슈가 승인·visible인 경우만 노출
       issue_id가 없는 투표(직접 생성 등)는 그대로 포함 */
    const data = (rawData ?? [])
        .filter((v) => {
            if (!v.issue_id) return true
            const iss = v.issues as { approval_status?: string; visibility_status?: string } | null
            if (!iss) return false
            return iss.approval_status === '승인' && iss.visibility_status === 'visible'
        })
        .map((v) => {
            /* 내부 필터용 필드를 제거하고 id·title만 남김 */
            if (v.issues) {
                const { approval_status: _a, visibility_status: _v, ...rest } = v.issues as Record<string, unknown>
                return { ...v, issues: rest }
            }
            return v
        })

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
