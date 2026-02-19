import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
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

    /* 해당 선택지가 이 투표에 속하는지 확인 */
    const { data: choice } = await supabase
        .from('vote_choices')
        .select('id')
        .eq('id', vote_choice_id)
        .eq('vote_id', vote_id)
        .single()

    if (!choice) {
        return NextResponse.json({ error: '유효하지 않은 선택지입니다.' }, { status: 400 })
    }

    /* 이미 투표한 기록 확인 */
    const { data: existing } = await supabase
        .from('user_votes')
        .select('id')
        .eq('vote_id', vote_id)
        .eq('user_id', user.id)
        .single()

    if (existing) {
        return NextResponse.json({ error: '이미 투표하셨습니다. 재투표는 불가합니다.' }, { status: 409 })
    }

    /* 투표 기록 저장 */
    const { error: insertError } = await supabase
        .from('user_votes')
        .insert({ vote_id, vote_choice_id, user_id: user.id })

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    /* 선택지 count +1 */
    const { error: countError } = await supabase.rpc('increment_vote_count', { choice_id: vote_choice_id })

    if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
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

    const { data: existing } = await supabase
        .from('user_votes')
        .select('id, vote_choice_id')
        .eq('vote_id', vote_id)
        .eq('user_id', user.id)
        .single()

    if (!existing) {
        return NextResponse.json({ error: '투표 기록이 없습니다.' }, { status: 404 })
    }

    /* 투표 기록 삭제 */
    const { error: deleteError } = await supabase
        .from('user_votes')
        .delete()
        .eq('id', existing.id)

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    /* 선택지 count -1 (0 미만 방지) */
    const { error: countError } = await supabase.rpc('decrement_vote_count', { choice_id: existing.vote_choice_id })

    if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
