/**
 * app/api/admin/votes/[id]/close/route.ts
 *
 * [관리자 - 투표 수동 종료 API]
 *
 * 진행 중인 투표를 즉시 마감 처리.
 * ended_at을 현재 시각으로 설정.
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
        .select('phase, title')
        .eq('id', id)
        .single()

    if (voteError || !vote) {
        return NextResponse.json(
            { error: '투표를 찾을 수 없습니다.' },
            { status: 404 }
        )
    }

    if (vote.phase !== '진행중') {
        return NextResponse.json(
            { error: '진행 중인 투표만 종료할 수 있습니다.' },
            { status: 422 }
        )
    }

    const { error: updateError } = await supabaseAdmin
        .from('votes')
        .update({
            phase: '마감',
            ended_at: new Date().toISOString(),
        })
        .eq('id', id)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await writeAdminLog('투표 수동 종료', 'vote', id, auth.adminEmail, `"${vote.title ?? '제목없음'}"`)
    revalidatePath('/')
    return NextResponse.json({ success: true }, { status: 200 })
}
