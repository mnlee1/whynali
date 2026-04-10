/**
 * app/api/admin/votes/[id]/approve/route.ts
 *
 * [관리자 - 투표 승인 API]
 *
 * 대기 상태의 투표를 승인하여 진행중 상태로 전환.
 * 승인 시 started_at을 현재 시각으로 설정.
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

    const { data: prev, error: prevError } = await supabaseAdmin
        .from('votes')
        .select('approval_status, title')
        .eq('id', id)
        .single()

    if (prevError || !prev) {
        return NextResponse.json({ error: '투표를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!['대기', '반려'].includes(prev.approval_status)) {
        return NextResponse.json(
            { error: '대기 또는 반려 상태의 투표가 아닙니다.' },
            { status: 422 }
        )
    }

    const { data, error } = await supabaseAdmin
        .from('votes')
        .update({
            phase: '진행중',
            approval_status: '승인',
            started_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, title')
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
        return NextResponse.json(
            { error: '투표 승인 처리에 실패했습니다.' },
            { status: 500 }
        )
    }

    await writeAdminLog(`투표 상태 변경: ${prev.approval_status} > 진행중`, 'vote', id, auth.adminEmail, `"${data.title ?? '제목없음'}"`)
    revalidatePath('/')
    return NextResponse.json({ data }, { status: 200 })
}
