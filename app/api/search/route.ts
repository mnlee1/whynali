import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/* GET /api/search?q=&limit=&offset= */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const q = searchParams.get('q')?.trim()
    const limit = Number(searchParams.get('limit') ?? 10)
    const offset = Number(searchParams.get('offset') ?? 0)

    if (!q || q.length < 2) {
        return NextResponse.json({ error: '검색어는 2자 이상 입력해 주세요.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()

    const [issueResult, discussionResult] = await Promise.all([
        supabase
            .from('issues')
            .select('id, title, status, category, created_at')
            .ilike('title', `%${q}%`)
            .eq('approval_status', '승인')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1),

        supabase
            .from('discussion_topics')
            .select('id, issue_id, body, created_at')
            .ilike('body', `%${q}%`)
            .eq('approval_status', '승인')
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
