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

    let issueQuery = admin
        .from('issues')
        .select('id, title, status, category, created_at')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT_TO_REGISTER)

    let discussionQuery = admin
        .from('discussion_topics')
        .select('id, issue_id, body, created_at')
        .eq('approval_status', '승인')

    if (keywords.length === 1) {
        issueQuery = issueQuery.ilike('title', `%${keywords[0]}%`)
        discussionQuery = discussionQuery.ilike('body', `%${keywords[0]}%`)
    } else {
        const issueOrConditions = keywords.map((k) => `title.ilike.%${k}%`).join(',')
        const discussionOrConditions = keywords.map((k) => `body.ilike.%${k}%`).join(',')
        issueQuery = issueQuery.or(issueOrConditions)
        discussionQuery = discussionQuery.or(discussionOrConditions)
    }

    const [issueResult, discussionResult] = await Promise.all([
        issueQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
        discussionQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),
    ])

    if (issueResult.error || discussionResult.error) {
        const msg = issueResult.error?.message ?? discussionResult.error?.message
        return NextResponse.json({ error: msg }, { status: 500 })
    }

    const issues = (issueResult.data ?? []).map((item) => ({ ...item, _type: 'issue' }))
    const discussions = (discussionResult.data ?? []).map((item) => ({ ...item, _type: 'discussion' }))

    return NextResponse.json({
        data: [...issues, ...discussions],
        counts: {
            issues: issues.length,
            discussions: discussions.length,
        },
    })
}
