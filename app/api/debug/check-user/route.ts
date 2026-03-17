/**
 * app/api/debug/check-user/route.ts
 *
 * [디버그용: 현재 로그인 유저의 terms_agreed_at 상태 확인]
 *
 * 온보딩이 작동하지 않을 때 유저 데이터를 확인하기 위한 임시 API
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
    try {
        const supabase = await createSupabaseServerClient()
        
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json({
                authenticated: false,
                error: '로그인되지 않음'
            })
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, provider, display_name, terms_agreed_at, marketing_agreed, created_at')
            .eq('id', user.id)
            .single()

        return NextResponse.json({
            authenticated: true,
            authUser: {
                id: user.id,
                email: user.email,
                provider: user.app_metadata?.provider,
            },
            dbUser: userData,
            dbError: userError?.message,
            needsOnboarding: userData ? !userData.terms_agreed_at : null
        })
    } catch (error) {
        console.error('디버그 API 오류:', error)
        return NextResponse.json(
            { error: '서버 오류' },
            { status: 500 }
        )
    }
}
