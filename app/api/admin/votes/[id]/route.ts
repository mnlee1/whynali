/**
 * app/api/admin/votes/[id]/route.ts
 *
 * [관리자 - 투표 삭제 API]
 *
 * 투표와 연결된 선택지를 모두 삭제.
 * 대기/반려 상태만 삭제 가능 (진행중/마감은 삭제 불가).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    const { data: vote, error: voteError } = await supabaseAdmin
        .from('votes')
        .select('phase, approval_status, title')
        .eq('id', id)
        .single()

    if (voteError || !vote) {
        return NextResponse.json(
            { error: '투표를 찾을 수 없습니다.' },
            { status: 404 }
        )
    }

    // 진행중이나 마감된 투표는 삭제 불가
    if (vote.phase === '진행중' || vote.phase === '마감') {
        return NextResponse.json(
            { error: '진행중이거나 마감된 투표는 삭제할 수 없습니다.' },
            { status: 422 }
        )
    }

    // 선택지 먼저 삭제 (외래키 제약)
    await supabaseAdmin
        .from('vote_choices')
        .delete()
        .eq('vote_id', id)

    // 투표 삭제
    const { error: deleteError } = await supabaseAdmin
        .from('votes')
        .delete()
        .eq('id', id)

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const details = vote.title ? vote.title.slice(0, 200) : null
    await writeAdminLog('투표 삭제', 'vote', id, auth.adminEmail, details)
    return NextResponse.json({ success: true }, { status: 200 })
}
