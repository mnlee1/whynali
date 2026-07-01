import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { BOT_USER_IDS } from '@/lib/bot/personas'

export const dynamic = 'force-dynamic'

/* GET /api/admin/bot-comments?limit=&offset=&persona_id= */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = request.nextUrl
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)
    const offset = Number(searchParams.get('offset') ?? 0)
    const personaId = searchParams.get('persona_id')

    try {
        let query = supabaseAdmin
            .from('comments')
            .select(
                'id, body, created_at, visibility, user_id, issue_id, discussion_topic_id, users(display_name), issues(id, title), discussion_topics(id, body)',
                { count: 'exact' }
            )
            .in('user_id', personaId ? [personaId] : BOT_USER_IDS)
            .not('visibility', 'in', '(deleted,deleted_by_admin)')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        const { data, error, count } = await query
        if (error) throw error

        return NextResponse.json({ data: data ?? [], total: count ?? 0 })
    } catch (e) {
        return NextResponse.json({ error: '봇 댓글 조회 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/bot-comments?id=<comment_id> */
export async function DELETE(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 파라미터 필요' }, { status: 400 })

    try {
        // 봇 댓글인지 확인
        const { data: comment } = await supabaseAdmin
            .from('comments')
            .select('user_id')
            .eq('id', id)
            .single()

        if (!comment || !BOT_USER_IDS.includes(comment.user_id)) {
            return NextResponse.json({ error: '봇 댓글이 아닙니다.' }, { status: 403 })
        }

        const { error } = await supabaseAdmin
            .from('comments')
            .update({ visibility: 'deleted_by_admin' })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
}
