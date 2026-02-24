/** app/api/admin/issues/[id]/restore/route.ts — [관리자 - 이슈 대기 복구 API] */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        /* 복구 시 approval_status를 대기로 되돌리고, visibility도 visible로 복원 */
        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '대기',
                approved_at: null,
                visibility_status: 'visible',
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 복구 에러:', error)
        return NextResponse.json(
            { error: 'RESTORE_ERROR', message: '이슈 복구 실패' },
            { status: 500 }
        )
    }
}
