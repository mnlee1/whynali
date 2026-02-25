/**
 * app/api/admin/issues/[id]/reject/route.ts
 * 
 * [관리자 - 이슈 거부 API]
 */

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

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '반려',
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 거부 에러:', error)
        return NextResponse.json(
            { error: 'REJECT_ERROR', message: '이슈 거부 실패' },
            { status: 500 }
        )
    }
}
