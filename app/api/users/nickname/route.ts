/**
 * app/api/users/nickname/route.ts
 *
 * [닉네임 변경 API]
 *
 * 로그인한 사용자의 닉네임을 변경합니다.
 * - 2~10자 유효성 검증
 * - 중복 확인
 * - users 테이블 display_name 업데이트
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const NICKNAME_MIN_LENGTH = 2
const NICKNAME_MAX_LENGTH = 10
const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/

export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: '로그인이 필요합니다.' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { nickname } = body

        if (!nickname || typeof nickname !== 'string') {
            return NextResponse.json(
                { error: '닉네임이 필요합니다.' },
                { status: 400 }
            )
        }

        if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
            return NextResponse.json(
                { error: `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다.` },
                { status: 400 }
            )
        }

        if (!NICKNAME_REGEX.test(nickname)) {
            return NextResponse.json(
                { error: '닉네임은 한글, 영문, 숫자, 언더스코어(_)만 사용할 수 있습니다.' },
                { status: 400 }
            )
        }

        const { data: existingUsers, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('display_name', nickname)
            .neq('id', user.id)
            .limit(1)

        if (checkError) {
            console.error('닉네임 중복 확인 오류:', checkError)
            return NextResponse.json(
                { error: '닉네임 확인에 실패했습니다.' },
                { status: 500 }
            )
        }

        if (existingUsers && existingUsers.length > 0) {
            return NextResponse.json(
                { error: '이미 사용 중인 닉네임입니다.' },
                { status: 409 }
            )
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({ display_name: nickname })
            .eq('id', user.id)

        if (updateError) {
            console.error('닉네임 업데이트 오류:', updateError)
            return NextResponse.json(
                { error: '닉네임 변경에 실패했습니다.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true, nickname })

    } catch (error) {
        console.error('닉네임 변경 API 오류:', error)
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
