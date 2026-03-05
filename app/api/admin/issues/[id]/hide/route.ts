/** app/api/admin/issues/[id]/hide/route.ts — [관리자 - 이슈 숨김 API] */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { closeVotesOnIssueDeleted } from '@/lib/vote-auto-closer'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        /* visibility_status = 'hidden'으로만 변경.
           approval_status는 그대로 유지해 검수 결과와 노출 여부를 분리한다. */
        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({ visibility_status: 'hidden' })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        // 이슈 숨김 시 관련 투표 자동 마감
        const { count } = await closeVotesOnIssueDeleted(id)
        if (count > 0) {
            console.log(`[투표 자동 마감] 이슈 ${id} 숨김 → ${count}개 투표 마감`)
        }

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 숨김 에러:', error)
        return NextResponse.json(
            { error: 'HIDE_ERROR', message: '이슈 숨김 실패' },
            { status: 500 }
        )
    }
}
