import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'

/* POST /api/reactions — 토글 (없으면 추가, 같은 타입이면 취소, 다른 타입이면 교체) */
export async function POST(request: NextRequest) {
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
    const { issue_id, type } = body

    if (!issue_id || !type) {
        return NextResponse.json({ error: 'issue_id와 type이 필요합니다.' }, { status: 400 })
    }

    const VALID_TYPES = ['좋아요', '싫어요', '화나요', '팝콘각', '응원', '애도', '사이다']
    if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: '유효하지 않은 감정 타입입니다.' }, { status: 400 })
    }

    const { data: existing } = await supabase
        .from('reactions')
        .select('id, type')
        .eq('issue_id', issue_id)
        .eq('user_id', user.id)
        .single()

    /* 같은 타입 → 취소(삭제) */
    if (existing?.type === type) {
        const { error } = await supabase.from('reactions').delete().eq('id', existing.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ action: 'removed', type })
    }

    /* 다른 타입 존재 → 교체(upsert) */
    const { data, error } = await supabase
        .from('reactions')
        .upsert({ issue_id, user_id: user.id, type }, { onConflict: 'issue_id,user_id' })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ action: existing ? 'changed' : 'added', data })
}
