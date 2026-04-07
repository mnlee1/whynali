import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT_TO_REGISTER } from '@/lib/config/candidate-thresholds'

/* GET /api/search?q=&limit=&offset= */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const q = searchParams.get('q')?.trim()
    const limit = Number(searchParams.get('limit') ?? 10)
    const offset = Number(searchParams.get('offset') ?? 0)

    if (!q || q.length < 2) {
        return NextResponse.json({ error: '검색어는 2자 이상 입력해 주세요.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    const keywords = q.split(/\s+/).filter((k) => k.length >= 2)

    if (keywords.length === 0) {
        return NextResponse.json({ error: '검색어는 2자 이상 입력해 주세요.' }, { status: 400 })
    }

    // 1단계: 이슈 키워드 검색
    let issueQuery = admin
        .from('issues')
        .select('id, title, status, category, created_at')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT_TO_REGISTER)

    if (keywords.length === 1) {
        issueQuery = issueQuery.ilike('title', `%${keywords[0]}%`)
    } else {
        issueQuery = issueQuery.or(keywords.map((k) => `title.ilike.%${k}%`).join(','))
    }

    const issueResult = await issueQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (issueResult.error) {
        return NextResponse.json({ error: issueResult.error.message }, { status: 500 })
    }

    const issues = (issueResult.data ?? []).map((item) => ({ ...item, _type: 'issue' }))
    const matchedIssueIds = issues.map((i) => i.id)

    // 2단계: 토론/투표 — 키워드 직접 매칭 OR 매칭된 이슈에 속한 것
    const buildOrFilter = (keywordField: string, ids: string[]) => {
        const keywordConds = keywords.map((k) => `${keywordField}.ilike.%${k}%`).join(',')
        if (ids.length === 0) return keywordConds
        const issueConds = `issue_id.in.(${ids.join(',')})`
        return `${keywordConds},${issueConds}`
    }

    const [discussionResult, voteResult] = await Promise.all([
        admin
            .from('discussion_topics')
            .select('id, issue_id, body, created_at')
            .in('approval_status', ['진행중', '마감'])
            .or(buildOrFilter('body', matchedIssueIds))
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
        admin
            .from('votes')
            .select('id, issue_id, title, phase, created_at')
            .eq('approval_status', '승인')
            .or(buildOrFilter('title', matchedIssueIds))
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
    ])

    if (discussionResult.error || voteResult.error) {
        const msg = discussionResult.error?.message ?? voteResult.error?.message
        return NextResponse.json({ error: msg }, { status: 500 })
    }

    const discussions = (discussionResult.data ?? []).map((item) => ({ ...item, _type: 'discussion' }))
    const votes = (voteResult.data ?? []).map((item) => ({ ...item, _type: 'vote' }))

    return NextResponse.json({
        data: [...issues, ...discussions, ...votes],
        counts: {
            issues: issues.length,
            discussions: discussions.length,
            votes: votes.length,
        },
    })
}
