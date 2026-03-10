/**
 * app/api/admin/votes/[id]/approve/route.ts
 *
 * [관리자 - 투표 승인 API]
 *
 * 대기 상태의 투표를 승인하여 진행중 상태로 전환.
 * 승인 시 started_at을 현재 시각으로 설정.
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

    const { data, error } = await supabaseAdmin
        .from('votes')
        .update({
            phase: '진행중',
            approval_status: '승인',
            started_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('approval_status', ['대기', '반려'])
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json(
            { error: '대기 또는 반려 상태의 투표가 아니거나 존재하지 않습니다.' },
            { status: 404 }
        )
    }

    await writeAdminLog('투표 승인', 'vote', id, auth.adminEmail)
    return NextResponse.json({ data }, { status: 200 })
}
