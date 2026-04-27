/**
 * app/api/admin/votes/[id]/reopen/route.ts
 *
 * [관리자 - 투표 재개 API]
 *
 * 마감된 투표를 다시 진행중 상태로 재개.
 * ended_at, auto_end_date를 초기화. 이슈가 종결 상태면 auto_end_date를 3일 후로 재설정.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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
        .select('phase, issue_id')
        .eq('id', id)
        .single()

    if (voteError || !vote) {
        return NextResponse.json(
            { error: '투표를 찾을 수 없습니다.' },
            { status: 404 }
        )
    }

    if (vote.phase !== '마감') {
        return NextResponse.json(
            { error: '마감된 투표만 재개할 수 있습니다.' },
            { status: 422 }
        )
    }

    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('status')
        .eq('id', vote.issue_id)
        .single()

    const now = new Date()
    let autoEndDate: string | null = null
    if (issue?.status === '종결') {
        const endDate = new Date(now)
        endDate.setDate(endDate.getDate() + 3)
        autoEndDate = endDate.toISOString()
    }

    const { error: updateError } = await supabaseAdmin
        .from('votes')
        .update({
            phase: '진행중',
            ended_at: null,
            auto_end_date: autoEndDate,
        })
        .eq('id', id)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await writeAdminLog('투표 상태 변경: 마감 > 진행중', 'vote', id, auth.adminEmail)
    revalidatePath('/')
    return NextResponse.json({ success: true }, { status: 200 })
}
