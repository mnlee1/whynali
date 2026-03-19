/**
 * app/api/users/nickname/check/route.ts
 *
 * GET ?nickname=xxx
 * 닉네임 사용 가능 여부 확인 (중복 체크)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/

export async function GET(request: NextRequest) {
    const nickname = request.nextUrl.searchParams.get('nickname') ?? ''

    if (nickname.length < 2 || nickname.length > 16 || !NICKNAME_REGEX.test(nickname)) {
        return NextResponse.json({ available: false })
    }

    const admin = createSupabaseAdminClient()
    const { count } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('display_name', nickname)

    return NextResponse.json({ available: count === 0 })
}
