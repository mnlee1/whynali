import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent, checkRateLimit } from '@/lib/safety'

type Params = { params: Promise<{ id: string }> }

/* GET /api/discussions/:id/comments?limit=&offset= */
export async function GET(request: NextRequest, { params }: Params) {
    const { id: discussion_topic_id } = await params
    const { searchParams } = request.nextUrl
    const limit = Number(searchParams.get('limit') ?? 20)
    const offset = Number(searchParams.get('offset') ?? 0)

    const supabase = await createSupabaseServerClient()
    const { data: rawData, error, count } = await supabase
        .from('comments')
        .select('*, users(display_name)', { count: 'exact' })
        .eq('discussion_topic_id', discussion_topic_id)
        .eq('visibility', 'public')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type Row = (typeof rawData)[number] & { users?: { display_name: string | null } | null }
    const data = (rawData ?? []).map((row: Row) => {
        const { users, ...comment } = row
        return { ...comment, display_name: users?.display_name ?? null }
    })

    return NextResponse.json({ data, total: count ?? 0 })
}

/* POST /api/discussions/:id/comments */
export async function POST(request: NextRequest, { params }: Params) {
    const { id: discussion_topic_id } = await params
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
    const { valid, reason } = validateContent(body.content, 'comment')
    if (!valid) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('comments')
        .insert({
            discussion_topic_id,
            parent_id: body.parent_id ?? null,
            user_id: user.id,
            body: sanitizeText(body.content),
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
}
