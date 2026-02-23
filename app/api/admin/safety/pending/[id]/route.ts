import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/* PATCH /api/admin/safety/pending/:id — 공개 처리 (visibility → public) */
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
            .from('comments')
            .update({ visibility: 'public' })
            .eq('id', id)
            .eq('visibility', 'pending_review')
            .select()
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json(
                { error: '검토 대기 댓글을 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        await writeAdminLog('댓글 공개', 'comment', id)
        return NextResponse.json({ data })
    } catch {
        return NextResponse.json({ error: '공개 처리 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/safety/pending/:id — 삭제 처리 (visibility → deleted) */
export async function DELETE(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params

        const { error } = await supabaseAdmin
            .from('comments')
            .update({
                visibility: 'deleted',
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)

        if (error) throw error

        await writeAdminLog('댓글 삭제', 'comment', id)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '삭제 처리 실패' }, { status: 500 })
    }
}
