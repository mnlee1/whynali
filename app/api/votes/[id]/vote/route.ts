/**
 * app/api/votes/[id]/vote/route.ts
 *
 * 투표 참여/취소 API
 *
 * RPC(vote_participate / vote_cancel) 우선 시도 후,
 * RPC 미적용 환경에서는 직접 DB 쿼리로 폴백 처리한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'

type Params = { params: Promise<{ id: string }> }

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

    const admin = createSupabaseAdminClient()

    /* RPC 우선 시도 */
    const { error: rpcError } = await admin.rpc('vote_participate', {
        p_vote_id:   vote_id,
        p_choice_id: vote_choice_id,
        p_user_id:   user.id,
    })

    if (!rpcError) {
        return NextResponse.json({ success: true }, { status: 201 })
    }

    /* RPC가 존재하지 않는 경우에만 직접 쿼리 폴백 */
    if (!rpcError.message?.includes('does not exist') && !rpcError.message?.includes('could not find')) {
        /* RPC가 배포된 상태에서 발생한 도메인 에러는 그대로 반환 */
        if (rpcError.message?.includes('VOTE_NOT_ACTIVE')) {
            return NextResponse.json({ error: '진행 중인 투표가 아닙니다.' }, { status: 409 })
        }
        if (rpcError.message?.includes('INVALID_CHOICE')) {
            return NextResponse.json({ error: '유효하지 않은 선택지입니다.' }, { status: 400 })
        }
        if (rpcError.message?.includes('ALREADY_VOTED')) {
            return NextResponse.json({ error: '이미 투표하셨습니다.' }, { status: 409 })
        }
        return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
    }

    /* ── 직접 쿼리 폴백 ── */

    /* 1. 투표 진행 여부 확인 */
    const { data: vote } = await admin
        .from('votes')
        .select('id, phase')
        .eq('id', vote_id)
        .single()

    if (!vote || vote.phase !== '진행중') {
        return NextResponse.json({ error: '진행 중인 투표가 아닙니다.' }, { status: 409 })
    }

    /* 2. 선택지 유효성 확인 */
    const { data: choice } = await admin
        .from('vote_choices')
        .select('id')
        .eq('id', vote_choice_id)
        .eq('vote_id', vote_id)
        .single()

    if (!choice) {
        return NextResponse.json({ error: '유효하지 않은 선택지입니다.' }, { status: 400 })
    }

    /* 3. 중복 투표 확인 */
    const { data: existing } = await admin
        .from('user_votes')
        .select('id')
        .eq('vote_id', vote_id)
        .eq('user_id', user.id)
        .single()

    if (existing) {
        return NextResponse.json({ error: '이미 투표하셨습니다.' }, { status: 409 })
    }

    /* 4. 투표 기록 저장 */
    const { error: insertError } = await admin
        .from('user_votes')
        .insert({ vote_id, vote_choice_id, user_id: user.id })

    if (insertError) {
        return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
    }

    /* 5. 선택지 count +1 */
    const { data: currentChoice } = await admin
        .from('vote_choices')
        .select('count')
        .eq('id', vote_choice_id)
        .single()

    if (currentChoice) {
        await admin
            .from('vote_choices')
            .update({ count: (currentChoice.count ?? 0) + 1 })
            .eq('id', vote_choice_id)
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

    const admin = createSupabaseAdminClient()

    /* RPC 우선 시도 */
    const { error: rpcError } = await admin.rpc('vote_cancel', {
        p_vote_id: vote_id,
        p_user_id: user.id,
    })

    if (!rpcError) {
        return NextResponse.json({ success: true })
    }

    /* RPC가 존재하지 않는 경우에만 직접 쿼리 폴백 */
    if (!rpcError.message?.includes('does not exist') && !rpcError.message?.includes('could not find')) {
        if (rpcError.message?.includes('VOTE_NOT_FOUND')) {
            return NextResponse.json({ error: '투표 기록이 없습니다.' }, { status: 404 })
        }
        return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
    }

    /* ── 직접 쿼리 폴백 ── */

    /* 1. 기존 투표 기록 조회 */
    const { data: userVote } = await admin
        .from('user_votes')
        .select('id, vote_choice_id')
        .eq('vote_id', vote_id)
        .eq('user_id', user.id)
        .single()

    if (!userVote) {
        return NextResponse.json({ error: '투표 기록이 없습니다.' }, { status: 404 })
    }

    /* 2. 투표 기록 삭제 */
    const { error: deleteError } = await admin
        .from('user_votes')
        .delete()
        .eq('vote_id', vote_id)
        .eq('user_id', user.id)

    if (deleteError) {
        return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
    }

    /* 3. 선택지 count -1 (0 미만 방지) */
    const { data: currentChoice } = await admin
        .from('vote_choices')
        .select('count')
        .eq('id', userVote.vote_choice_id)
        .single()

    if (currentChoice) {
        await admin
            .from('vote_choices')
            .update({ count: Math.max((currentChoice.count ?? 1) - 1, 0) })
            .eq('id', userVote.vote_choice_id)
    }

    return NextResponse.json({ success: true })
}
