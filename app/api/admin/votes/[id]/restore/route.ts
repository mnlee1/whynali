/**
 * app/api/admin/votes/[id]/restore/route.ts
 *
 * [관리자 - 투표 복구 API]
 *
 * 진행중 상태의 투표를 대기 상태로 되돌린다.
 * started_at을 초기화하여 재승인 시 새로 설정되도록 함.
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
        .select('phase, title')
        .eq('id', id)
        .single()

    if (prevError || !prev) {
        return NextResponse.json({ error: '투표를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (prev.phase !== '진행중') {
        return NextResponse.json(
            { error: '진행중 상태의 투표가 아닙니다.' },
            { status: 422 }
        )
    }

    const { data, error } = await supabaseAdmin
        .from('votes')
        .update({
            phase: '대기',
            approval_status: '대기',
            started_at: null,
        })
        .eq('id', id)
        .select('id, title')
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await writeAdminLog('투표 상태 변경: 진행중 > 대기', 'vote', id, auth.adminEmail, `"${data.title ?? '제목없음'}"`)
    revalidatePath('/')
    return NextResponse.json({ data }, { status: 200 })
}
