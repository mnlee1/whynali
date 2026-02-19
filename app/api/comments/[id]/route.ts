import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sanitizeText, validateContent } from '@/lib/safety'

/* PATCH /api/comments/:id */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { data: existing } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', id)
        .single()

    if (!existing) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
        return NextResponse.json({ error: '본인 댓글만 수정할 수 있습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { valid, reason } = validateContent(body.content, 'comment')
    if (!valid) {
        return NextResponse.json({ error: reason }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('comments')
        .update({ body: sanitizeText(body.content), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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

    const { data: existing } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', id)
        .single()

    if (!existing) {
        return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
        return NextResponse.json({ error: '본인 댓글만 삭제할 수 있습니다.' }, { status: 403 })
    }

    const { error } = await supabase
        .from('comments')
        .update({ visibility: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
