/** app/api/admin/issues/[id]/hide/route.ts — [관리자 - 이슈 숨김 API] */

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
                approval_status: '반려',
                approved_at: null,
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 숨김 에러:', error)
        return NextResponse.json(
            { error: 'HIDE_ERROR', message: '이슈 숨김 실패' },
            { status: 500 }
        )
    }
}
