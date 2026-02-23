import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent, checkRateLimit } from '@/lib/safety'

/* GET /api/discussions?issue_id=&q=&limit=&offset= */
/* issue_id 생략 시 전체 목록, q 지정 시 본문 키워드 검색 */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const issue_id = searchParams.get('issue_id')
    const q = searchParams.get('q')?.trim()
    const limit = Number(searchParams.get('limit') ?? 20)
    const offset = Number(searchParams.get('offset') ?? 0)

    const admin = createSupabaseAdminClient()

    let query = admin
        .from('discussion_topics')
        .select('*, issues(id, title)', { count: 'exact' })
        .in('approval_status', ['승인', '종료'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (issue_id) {
        query = query.eq('issue_id', issue_id)
    }
    if (q) {
        query = query.ilike('body', `%${q}%`)
    }

    const { data, error, count } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, total: count ?? 0 })
}

/* POST /api/discussions */
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { allowed, reason: limitReason } = checkRateLimit(user.id)
    if (!allowed) {
        return NextResponse.json({ error: limitReason }, { status: 429 })
    }

    const body = await request.json()
    const { issue_id, content } = body

    if (!issue_id) {
        return NextResponse.json({ error: 'issue_id가 필요합니다.' }, { status: 400 })
    }

    const { valid, reason } = validateContent(content, 'discussion')
    if (!valid) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    const { data, error } = await admin
        .from('discussion_topics')
        .insert({
            issue_id,
            body: sanitizeText(content),
            is_ai_generated: false,
            approval_status: '대기',
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
}
