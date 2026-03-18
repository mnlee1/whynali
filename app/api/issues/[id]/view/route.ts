/**
 * app/api/issues/[id]/view/route.ts
 *
 * [이슈 조회수 증가 API]
 *
 * 이슈 상세 페이지 방문 시 view_count를 1 증가시킵니다.
 * 클라이언트 ViewCounter 컴포넌트에서 마운트 시 한 번 호출됩니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { error } = await supabaseAdmin.rpc('increment_issue_view_count', {
            p_issue_id: id,
        })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('View count increment error:', error)
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: '조회수 업데이트 실패' },
            { status: 500 }
        )
    }
}
