import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { BOT_USER_IDS } from '@/lib/bot/personas'
import { postBotComment, postBotDiscussionComment } from '@/lib/bot/bot-commenter'

export const dynamic = 'force-dynamic'

/* POST /api/admin/bot-comments/regenerate  body: { comment_id: string } */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { comment_id } = await request.json().catch(() => ({}))
    if (!comment_id) return NextResponse.json({ error: 'comment_id 파라미터 필요' }, { status: 400 })

    const { data: comment, error: fetchError } = await supabaseAdmin
        .from('comments')
        .select('user_id, issue_id, discussion_topic_id')
        .eq('id', comment_id)
        .single()

    if (fetchError || !comment || !BOT_USER_IDS.includes(comment.user_id)) {
        return NextResponse.json({ error: '봇 댓글이 아닙니다.' }, { status: 403 })
    }

    const { error: deleteError } = await supabaseAdmin
        .from('comments')
        .update({ visibility: 'deleted_by_admin' })
        .eq('id', comment_id)

    if (deleteError) return NextResponse.json({ error: '기존 댓글 삭제 실패' }, { status: 500 })

    const posted = comment.issue_id
        ? await postBotComment(comment.issue_id, { force: true, excludePersonaIds: [comment.user_id] })
        : comment.discussion_topic_id
        ? await postBotDiscussionComment(comment.discussion_topic_id, { force: true, excludePersonaIds: [comment.user_id] })
        : false

    return NextResponse.json({ ok: true, posted })
}
