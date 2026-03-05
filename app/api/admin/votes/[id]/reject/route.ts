/**
 * app/api/admin/votes/[id]/reject/route.ts
 *
 * [관리자 - 투표 반려 API]
 *
 * 대기 상태의 투표를 반려 처리.
 * 투표와 연결된 선택지를 모두 삭제.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    const { data: vote, error: voteError } = await supabaseAdmin
        .from('votes')
        .select('phase')
        .eq('id', id)
        .single()

    if (voteError || !vote) {
        return NextResponse.json(
            { error: '투표를 찾을 수 없습니다.' },
            { status: 404 }
        )
    }

    if (vote.phase !== '대기') {
        return NextResponse.json(
            { error: '대기 상태의 투표만 반려할 수 있습니다.' },
            { status: 422 }
        )
    }

    await supabaseAdmin
        .from('vote_choices')
        .delete()
        .eq('vote_id', id)

    const { error: deleteError } = await supabaseAdmin
        .from('votes')
        .delete()
        .eq('id', id)

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    await writeAdminLog('투표 반려', 'vote', id, auth.adminEmail)
    return NextResponse.json({ success: true }, { status: 200 })
}
