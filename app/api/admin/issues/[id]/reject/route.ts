/**
 * app/api/admin/issues/[id]/reject/route.ts
 * 
 * [관리자 - 이슈 거부 API]
 */

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
                approval_status: '거부',
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
