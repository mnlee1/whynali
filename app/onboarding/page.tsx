/**
 * app/onboarding/page.tsx
 *
 * [온보딩 페이지]
 *
 * 신규 유저가 약관 동의 및 닉네임 설정을 완료하는 페이지입니다.
 * - 로그인된 유저만 접근 가능
 * - terms_agreed_at가 이미 있으면 홈으로 리다이렉트
 * - 랜덤 닉네임 추천 (최대 3회)
 * - 약관 동의 (필수 2개 + 선택 1개)
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { generateUniqueNickname } from '@/lib/random-nickname'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
    const supabase = await createSupabaseServerClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/login?next=/onboarding')
    }

    const { data: userData } = await supabase
        .from('users')
        .select('terms_agreed_at')
        .eq('id', user.id)
        .single()

    if (userData?.terms_agreed_at) {
        redirect('/')
    }

    const initialNickname = await generateUniqueNickname(supabase)

    return <OnboardingClient initialNickname={initialNickname} />
}
