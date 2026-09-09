/**
 * app/api/curation-follows/route.ts
 *
 * [큐레이션 관심(팔로우) API]
 * GET  — 현재 사용자가 관심 등록한 큐레이션 키 목록
 * POST — 토글 (없으면 추가, 있으면 취소)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'
import { toUserMessage } from '@/lib/api-errors'
import { ensurePublicUser } from '@/lib/ensure-user'

export const preferredRegion = 'icn1'

export async function GET() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ keys: [] })
    }

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
        .from('curation_follows')
        .select('curation_key')
        .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })

    return NextResponse.json({ keys: (data ?? []).map(row => row.curation_key) })
}

export async function POST(request: NextRequest) {
    const { curationKey } = await request.json()

    if (!curationKey || typeof curationKey !== 'string') {
        return NextResponse.json({ error: 'curationKey가 필요합니다.' }, { status: 400 })
    }

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

    const { data: existing } = await admin
        .from('curation_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('curation_key', curationKey)
        .maybeSingle()

    if (existing) {
        const { error } = await admin.from('curation_follows').delete().eq('id', existing.id)
        if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
        return NextResponse.json({ action: 'removed', followed: false })
    }

    const { error } = await admin
        .from('curation_follows')
        .insert({ user_id: user.id, curation_key: curationKey })

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
    return NextResponse.json({ action: 'added', followed: true })
}
