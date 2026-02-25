import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'
import { toUserMessage } from '@/lib/api-errors'
import { ensurePublicUser } from '@/lib/ensure-user'

/* GET /api/reactions?issue_id= — 타입별 집계 + 현재 사용자 반응 */
export async function GET(request: NextRequest) {
    const issue_id = request.nextUrl.searchParams.get('issue_id')

    if (!issue_id) {
        return NextResponse.json({ error: 'issue_id가 필요합니다.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    const { data, error } = await admin
        .from('reactions')
        .select('type, user_id')
        .eq('issue_id', issue_id)

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
        counts[row.type] = (counts[row.type] ?? 0) + 1
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userReaction = user
        ? ((data ?? []).find((r) => r.user_id === user.id)?.type ?? null)
        : null

    return NextResponse.json({ counts, userReaction })
}

/* POST /api/reactions — 토글 (없으면 추가, 같은 타입이면 취소, 다른 타입이면 교체) */
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    await ensurePublicUser(supabase, admin, user)

    const { allowed, reason } = checkRateLimit(user.id)
    if (!allowed) {
        return NextResponse.json({ error: reason }, { status: 429 })
    }

    const body = await request.json()
    const { issue_id, type } = body

    if (!issue_id || !type) {
        return NextResponse.json({ error: 'issue_id와 type이 필요합니다.' }, { status: 400 })
    }

    const VALID_TYPES = ['좋아요', '싫어요', '화나요', '팝콘각', '응원', '애도', '사이다']
    if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: '유효하지 않은 감정 타입입니다.' }, { status: 400 })
    }

    const { data: existing } = await admin
        .from('reactions')
        .select('id, type')
        .eq('issue_id', issue_id)
        .eq('user_id', user.id)
        .maybeSingle()

    /* 같은 타입 → 취소(삭제) */
    if (existing?.type === type) {
        const { error } = await admin.from('reactions').delete().eq('id', existing!.id)
        if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
        return NextResponse.json({ action: 'removed', type })
    }

    /* 다른 타입 존재 → update, 없으면 insert (upsert 제거로 ON CONFLICT 오류 방지) */
    if (existing) {
        const { data, error } = await admin
            .from('reactions')
            .update({ type })
            .eq('id', existing.id)
            .select()
            .single()
        if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
        return NextResponse.json({ action: 'changed', data })
    }

    const { data, error } = await admin
        .from('reactions')
        .insert({ issue_id, user_id: user.id, type })
        .select()
        .single()

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
    return NextResponse.json({ action: 'added', data })
}
