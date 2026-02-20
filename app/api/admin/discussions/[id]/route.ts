import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/* PATCH /api/admin/discussions/:id
   body: { action: '승인' | '반려' } */
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params
        const body = await request.json()
        const { action } = body

        if (action !== '승인' && action !== '반려') {
            return NextResponse.json(
                { error: 'action은 "승인" 또는 "반려"여야 합니다.' },
                { status: 400 }
            )
        }

        const updatePayload =
            action === '승인'
                ? { approval_status: '승인', approved_at: new Date().toISOString() }
                : { approval_status: '반려', approved_at: null }

        const { data, error } = await supabaseAdmin
            .from('discussion_topics')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json({ error: '토론 주제를 찾을 수 없습니다.' }, { status: 404 })
        }

        return NextResponse.json({ data })
    } catch (e) {
        return NextResponse.json({ error: '처리 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/discussions/:id — 완전 삭제 */
export async function DELETE(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params

        const { error } = await supabaseAdmin
            .from('discussion_topics')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
}
