import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent, loadBannedWords } from '@/lib/safety'

/* PATCH /api/comments/:id */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    const { data: existing } = await admin
        .from('comments')
        .select('user_id, visibility')
        .eq('id', id)
        .neq('visibility', 'deleted')
        .single()

    if (!existing) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
        return NextResponse.json({ error: '본인 댓글만 수정할 수 있습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const dbBannedWords = await loadBannedWords(admin)
    const { valid, pendingReview, reason } = validateContent(body.content, 'comment', dbBannedWords)
    if (!valid && !pendingReview) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    const { data, error } = await admin
        .from('comments')
        .update({
            body: sanitizeText(body.content),
            updated_at: new Date().toISOString(),
            ...(pendingReview ? { visibility: 'pending_review' } : {}),
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (pendingReview) {
        return NextResponse.json({
            data,
            message: '수정되었습니다. 내용 검토 후 공개되거나 삭제될 수 있습니다.',
            pending: true,
        })
    }

    return NextResponse.json({ data })
}

/* DELETE /api/comments/:id */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    const { data: existing } = await admin
        .from('comments')
        .select('user_id, visibility')
        .eq('id', id)
        .neq('visibility', 'deleted')
        .single()

    if (!existing) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
        return NextResponse.json({ error: '본인 댓글만 삭제할 수 있습니다.' }, { status: 403 })
    }

    // 답글 수 확인: 답글이 있으면 soft delete (맥락 보존), 없으면 완전 삭제
    // pending_review 답글은 사용자에게 보이지 않으므로 없는 것으로 취급
    const { count: replyCount } = await admin
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id)
        .eq('visibility', 'public')

    let error
    if (replyCount && replyCount > 0) {
        // 답글 있음 → soft delete (화면에 "삭제된 댓글" 표시)
        ;({ error } = await admin
            .from('comments')
            .update({ visibility: 'deleted', updated_at: new Date().toISOString() })
            .eq('id', id))
    } else {
        // 답글 없음 → 완전 삭제
        ;({ error } = await admin
            .from('comments')
            .delete()
            .eq('id', id))
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
