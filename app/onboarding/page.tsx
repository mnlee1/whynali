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
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { generateUniqueNickname } from '@/lib/random-nickname'
import { isAdminEmail } from '@/lib/admin'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?next=/onboarding')
    }

    // 관리자 계정은 온보딩 불필요 — 대시보드로 바로 이동
    if (isAdminEmail(user.email)) {
        redirect('/admin')
    }

    // admin 클라이언트로 RLS 우회 + display_name 포함 조회
    const adminClient = createSupabaseAdminClient()
    const { data: userData } = await adminClient
        .from('users')
        .select('terms_agreed_at, display_name')
        .eq('id', user.id)
        .single()

    if (userData?.terms_agreed_at && userData?.display_name) {
        redirect('/')
    }

    const initialNickname = await generateUniqueNickname(adminClient)

    return <OnboardingClient initialNickname={initialNickname} />
}
