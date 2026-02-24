/**
 * app/api/issues/[id]/timeline/[pointId]/route.ts
 *
 * 타임라인 포인트 개별 조작 API.
 * 관리자가 특정 타임라인 포인트를 삭제할 때 사용합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string; pointId: string }> }
) {
    const { pointId } = await context.params

    try {
        const { error } = await supabaseAdmin
            .from('timeline_points')
            .delete()
            .eq('id', pointId)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Timeline point delete error:', error)
        return NextResponse.json(
            { error: 'DELETE_ERROR', message: '타임라인 포인트 삭제 실패' },
            { status: 500 }
        )
    }
}
