/**
 * app/api/onboarding/route.ts
 *
 * [온보딩 완료 API]
 *
 * 신규 유저의 약관 동의 및 닉네임 설정을 처리합니다.
 * - 로그인 세션 확인
 * - 닉네임 중복 확인
 * - users 테이블 업데이트 (display_name, terms_agreed_at, marketing_agreed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { generateUniqueNickname } from '@/lib/random-nickname'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const adminClient = createSupabaseAdminClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: '로그인이 필요합니다.' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { nickname, marketingAgreed, contactEmail } = body

        if (!nickname || typeof nickname !== 'string') {
            return NextResponse.json(
                { error: '닉네임이 필요합니다.' },
                { status: 400 }
            )
        }

        if (nickname.length < 2 || nickname.length > 16) {
            return NextResponse.json(
                { error: '닉네임은 2~16자여야 합니다.' },
                { status: 400 }
            )
        }

        if (!/^[가-힣a-zA-Z0-9_]+$/.test(nickname)) {
            return NextResponse.json(
                { error: '닉네임은 한글, 영문, 숫자, _만 사용할 수 있습니다.' },
                { status: 400 }
            )
        }

        const { count, error: checkError } = await adminClient
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('display_name', nickname)

        if (checkError) {
            console.error('닉네임 중복 확인 오류:', checkError)
            return NextResponse.json(
                { error: '닉네임 확인에 실패했습니다.' },
                { status: 500 }
            )
        }

        if (count && count > 0) {
            const newNickname = await generateUniqueNickname(adminClient)
            return NextResponse.json(
                { error: '이미 사용 중인 닉네임입니다.', suggestion: newNickname },
                { status: 409 }
            )
        }

        const updatePayload: Record<string, unknown> = {
            display_name: nickname,
            terms_agreed_at: new Date().toISOString(),
            marketing_agreed: Boolean(marketingAgreed),
            contact_email: (typeof contactEmail === 'string' && contactEmail.trim()) ? contactEmail.trim() : null,
        }

        const { error: updateError } = await adminClient
            .from('users')
            .update(updatePayload)
            .eq('id', user.id)

        if (updateError) {
            console.error('유저 정보 업데이트 오류:', updateError)
            return NextResponse.json(
                { error: '온보딩 처리에 실패했습니다.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('온보딩 API 오류:', error)
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
