/**
 * app/api/admin/votes/[id]/route.ts
 *
 * [관리자 - 투표 삭제 API]
 *
 * 투표와 연결된 선택지를 모두 삭제.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
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

    // 소프트 삭제: 완전 삭제 대신 deleted_at만 기록하고 조회에서 제외한다 (되돌리기 위해 원본은 보존)
    const { error: deleteError } = await supabaseAdmin
        .from('votes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    await writeAdminLog('투표 삭제', 'vote', id, auth.adminEmail, `"${vote.title ?? '제목없음'}"`)
    return NextResponse.json({ success: true }, { status: 200 })
}
