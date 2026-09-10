import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

export const preferredRegion = 'icn1'

/* GET /api/votes?issue_id=&limit= — 투표 목록 + 선택지 + 현재 사용자 참여 기록 */
export async function GET(request: NextRequest) {
    const issue_id = request.nextUrl.searchParams.get('issue_id')
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 0)

    const admin = createSupabaseAdminClient()

    const SELECT = 'id, title, phase, approval_status, is_ai_generated, issue_id, created_at, auto_end_date, issue_status_snapshot, vote_choices(*), issues(id, title, approval_status, visibility_status, category, topic_description, brief_summary, heat_index, thumbnail_urls, primary_thumbnail_index)'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawData: any[] = []

    if (!issue_id && limit > 0) {
        // 진행중/마감을 구분 없이 created_at으로만 정렬해 limit을 적용하면, 최근 생성된
        // 마감 투표가 많을 때 마감 임박한 오래된 진행중 투표가 상위 결과에서 잘려나갈 수 있다.
        // 진행중을 먼저 채우고 남는 자리만 마감 투표로 채워 이를 방지한다.
        const { data: activeData, error: activeError } = await admin
            .from('votes')
            .select(SELECT)
            .eq('phase', '진행중')
            .eq('approval_status', '승인')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (activeError) {
            console.error('[GET /api/votes] 진행중 투표 조회 실패:', activeError)
            return NextResponse.json({ error: '투표 목록을 불러오지 못했습니다.' }, { status: 500 })
        }

        const remaining = limit - (activeData?.length ?? 0)
        let closedData: typeof activeData = []
        if (remaining > 0) {
            const { data, error: closedError } = await admin
                .from('votes')
                .select(SELECT)
                .eq('phase', '마감')
                .eq('approval_status', '승인')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(remaining)

            if (closedError) {
                console.error('[GET /api/votes] 마감 투표 조회 실패:', closedError)
                return NextResponse.json({ error: '투표 목록을 불러오지 못했습니다.' }, { status: 500 })
            }
            closedData = data ?? []
        }

        rawData = [...(activeData ?? []), ...closedData]
    } else {
        let query = admin
            .from('votes')
            .select(SELECT)
            .in('phase', ['진행중', '마감'])
            .eq('approval_status', '승인')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

        if (issue_id) {
            query = query.eq('issue_id', issue_id)
        }

        if (limit > 0) {
            query = query.limit(limit)
        }

        const { data, error } = await query
        if (error) {
            console.error('[GET /api/votes] 투표 조회 실패:', error)
            return NextResponse.json({ error: '투표 목록을 불러오지 못했습니다.' }, { status: 500 })
        }
        rawData = data ?? []
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
            /* 내부 필터용 필드(approval_status/visibility_status)만 제거하고 나머지는 그대로 노출 */
            if (v.issues) {
                const iss = v.issues as unknown as {
                    id: string
                    title: string
                    category: string
                    topic_description: string | null
                    brief_summary: unknown
                    heat_index: number | null
                    approval_status?: string
                    visibility_status?: string
                }
                const { approval_status: _a, visibility_status: _v, ...rest } = iss
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
