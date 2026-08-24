/**
 * app/api/issues/[id]/bookmark/route.ts
 *
 * [이슈 북마크 API]
 * GET  — 현재 사용자의 북마크 여부 + 전체 북마크 수
 * POST — 토글 (없으면 추가, 있으면 취소)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/safety'
import { toUserMessage } from '@/lib/api-errors'
import { ensurePublicUser } from '@/lib/ensure-user'

export const preferredRegion = 'icn1'

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: issue_id } = await context.params
    const admin = createSupabaseAdminClient()

    const { count, error } = await admin
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('issue_id', issue_id)

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let bookmarked = false
    if (user) {
        const { data } = await admin
            .from('bookmarks')
            .select('id')
            .eq('issue_id', issue_id)
            .eq('user_id', user.id)
            .maybeSingle()
        bookmarked = !!data
    }

    return NextResponse.json({ count: count ?? 0, bookmarked })
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id: issue_id } = await context.params
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
        .from('bookmarks')
        .select('id')
        .eq('issue_id', issue_id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (existing) {
        const { error } = await admin.from('bookmarks').delete().eq('id', existing.id)
        if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
        return NextResponse.json({ action: 'removed', bookmarked: false })
    }

    const { error } = await admin
        .from('bookmarks')
        .insert({ issue_id, user_id: user.id })

    if (error) return NextResponse.json({ error: toUserMessage(error.message) }, { status: 500 })
    return NextResponse.json({ action: 'added', bookmarked: true })
}
