/**
 * app/api/admin/votes/[id]/reject/route.ts
 *
 * [관리자 - 투표 반려 API]
 *
 * 대기 상태의 투표를 반려 처리.
 * approval_status를 '반려'로 변경 (삭제하지 않음).
 * 삭제는 별도 DELETE API 사용.
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
        .select('phase, approval_status, title')
        .eq('id', id)
        .single()

    if (voteError || !vote) {
        return NextResponse.json(
            { error: '투표를 찾을 수 없습니다.' },
            { status: 404 }
        )
    }

    if (!['대기', '승인'].includes(vote.approval_status)) {
        return NextResponse.json(
            { error: '이미 반려된 투표입니다.' },
            { status: 422 }
        )
    }

    const updateData: Record<string, string> = { approval_status: '반려' }
    if (vote.phase === '진행중') {
        updateData.phase = '마감'
    }

    const { error: updateError } = await supabaseAdmin
        .from('votes')
        .update(updateData)
        .eq('id', id)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await writeAdminLog('투표 반려', 'vote', id, auth.adminEmail, `"${vote.title ?? '제목없음'}"`)
    return NextResponse.json({ success: true }, { status: 200 })
}
