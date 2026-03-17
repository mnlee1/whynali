/**
 * app/api/onboarding/nickname/route.ts
 *
 * [온보딩 닉네임 재생성 API]
 *
 * 온보딩 중에 새로운 랜덤 닉네임을 생성하여 반환합니다.
 */

import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { generateUniqueNickname } from '@/lib/random-nickname'

export async function GET() {
    try {
        const supabase = createSupabaseAdminClient()
        const nickname = await generateUniqueNickname(supabase)

        return NextResponse.json({ nickname })
    } catch (error) {
        console.error('닉네임 생성 오류:', error)
        return NextResponse.json(
            { error: '닉네임 생성에 실패했습니다.' },
            { status: 500 }
        )
    }
}
