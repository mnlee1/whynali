/**
 * app/api/votes/[id]/vote/route.ts
 *
 * 투표 참여/취소 API
 *
 * user_votes insert/delete와 vote_choices count 증감을 단일 DB 트랜잭션으로 처리.
 * vote_participate / vote_cancel RPC 함수 사용 (supabase/migrations/add_vote_atomic_functions.sql).
 * 중간 실패 시 카운트 불일치가 발생하지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'

type Params = { params: Promise<{ id: string }> }

/* DB 함수 에러 코드 → HTTP 상태 매핑 */
const RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
    VOTE_NOT_ACTIVE: { status: 409, message: '진행 중인 투표가 아닙니다.' },
    INVALID_CHOICE:  { status: 400, message: '유효하지 않은 선택지입니다.' },
    ALREADY_VOTED:   { status: 409, message: '이미 투표하셨습니다. 재투표는 불가합니다.' },
    VOTE_NOT_FOUND:  { status: 404, message: '투표 기록이 없습니다.' },
}

function resolveRpcError(error: { message?: string }): { status: number; message: string } {
    const code = Object.keys(RPC_ERROR_MAP).find((k) => error.message?.includes(k))
    return code ? RPC_ERROR_MAP[code] : { status: 500, message: '처리 중 오류가 발생했습니다.' }
}

/* POST /api/votes/:id/vote — 투표 참여 */
export async function POST(request: NextRequest, { params }: Params) {
    const { id: vote_id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { allowed, reason } = checkRateLimit(user.id)
    if (!allowed) {
        return NextResponse.json({ error: reason }, { status: 429 })
    }

    const body = await request.json()
    const { vote_choice_id } = body

    if (!vote_choice_id) {
        return NextResponse.json({ error: 'vote_choice_id가 필요합니다.' }, { status: 400 })
    }

    /* vote_participate RPC: 검증 + insert + count+1 원자 처리 */
    const admin = createSupabaseAdminClient()
    const { error } = await admin.rpc('vote_participate', {
        p_vote_id:   vote_id,
        p_choice_id: vote_choice_id,
        p_user_id:   user.id,
    })

    if (error) {
        const { status, message } = resolveRpcError(error)
        return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ success: true }, { status: 201 })
}

/* DELETE /api/votes/:id/vote — 투표 취소 */
export async function DELETE(request: NextRequest, { params }: Params) {
    const { id: vote_id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    /* vote_cancel RPC: delete + count-1 원자 처리 */
    const admin = createSupabaseAdminClient()
    const { error } = await admin.rpc('vote_cancel', {
        p_vote_id: vote_id,
        p_user_id: user.id,
    })

    if (error) {
        const { status, message } = resolveRpcError(error)
        return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ success: true })
}
