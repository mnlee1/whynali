import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent, checkRateLimit } from '@/lib/safety'

/* GET /api/comments?issue_id=&limit=&offset= */
/* GET /api/comments?discussion_topic_id=&limit=&offset= */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const issue_id = searchParams.get('issue_id')
    const discussion_topic_id = searchParams.get('discussion_topic_id')
    const limit = Number(searchParams.get('limit') ?? 20)
    const offset = Number(searchParams.get('offset') ?? 0)

    if (!issue_id && !discussion_topic_id) {
        return NextResponse.json(
            { error: 'issue_id 또는 discussion_topic_id가 필요합니다.' },
            { status: 400 }
        )
    }

    const admin = createSupabaseAdminClient()

    let query = admin
        .from('comments')
        .select('*', { count: 'exact' })
        .eq('visibility', 'public')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (issue_id) {
        query = query.eq('issue_id', issue_id)
    } else {
        query = query.eq('discussion_topic_id', discussion_topic_id!)
    }

    const { data, error, count } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, total: count ?? 0 })
}

/* POST /api/comments */
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { allowed, reason: limitReason } = checkRateLimit(user.id)
    if (!allowed) {
        return NextResponse.json({ error: limitReason }, { status: 429 })
    }

    const body = await request.json()
    const { issue_id, discussion_topic_id, parent_id, content } = body

    if (!issue_id && !discussion_topic_id) {
        return NextResponse.json({ error: 'issue_id 또는 discussion_topic_id가 필요합니다.' }, { status: 400 })
    }

    const { valid, reason } = validateContent(content, 'comment')
    if (!valid) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('comments')
        .insert({
            issue_id: issue_id ?? null,
            discussion_topic_id: discussion_topic_id ?? null,
            parent_id: parent_id ?? null,
            user_id: user.id,
            body: sanitizeText(content),
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
}
