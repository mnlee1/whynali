/** app/api/admin/issues/[id]/restore/route.ts — [관리자 - 이슈 대기 복구 API] */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '대기',
                approved_at: null,
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
