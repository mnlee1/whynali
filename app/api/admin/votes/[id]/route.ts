import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/* PATCH /api/admin/votes/:id
   body: { action: '마감' | '재개' } */
export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const body = await request.json()
        const { action } = body

        const VALID_ACTIONS = ['마감', '재개'] as const
        if (!VALID_ACTIONS.includes(action)) {
            return NextResponse.json(
                { error: 'action은 마감 | 재개 중 하나여야 합니다.' },
                { status: 400 }
            )
        }

        const phase = action === '마감' ? '마감' : '진행중'

        const { data, error } = await supabaseAdmin
            .from('votes')
            .update({ phase })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json({ error: '투표를 찾을 수 없습니다.' }, { status: 404 })
        }

        await writeAdminLog(`투표 ${action}`, 'vote', id, auth.adminEmail)
        return NextResponse.json({ data })
    } catch {
        return NextResponse.json({ error: '처리 실패' }, { status: 500 })
    }
}

/* DELETE /api/admin/votes/:id — 투표 완전 삭제 (선택지·참여 기록 cascade) */
export async function DELETE(_request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { error } = await supabaseAdmin
            .from('votes')
            .delete()
            .eq('id', id)

        if (error) throw error

        await writeAdminLog('투표 삭제', 'vote', id, auth.adminEmail)
        return NextResponse.json({ success: true })
    } catch {
        return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    }
}
