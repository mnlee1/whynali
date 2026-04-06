/**
 * app/onboarding/page.tsx
 *
 * [온보딩 페이지]
 *
 * 신규 유저가 약관 동의 및 닉네임 설정을 완료하는 페이지입니다.
 * - 로그인된 유저만 접근 가능
 * - terms_agreed_at가 이미 있으면 홈으로 리다이렉트
 * - 랜덤 닉네임 추천 (최대 5회)
 * - 약관 동의 (필수 3개: 만 14세 확인·이용약관·개인정보처리방침 + 선택 1개: 마케팅)
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

    const provider = (user.user_metadata?.provider ?? user.app_metadata?.provider) as string | undefined
    const providerAccount = (() => {
        switch (provider) {
            case 'naver':
                return (user.user_metadata?.naver_nickname as string | undefined)
                    ?? (user.user_metadata?.naver_email as string | undefined)
                    ?? null
            case 'kakao':
                return (user.user_metadata?.kakao_nickname as string | undefined)
                    ?? (user.user_metadata?.real_email as string | undefined)
                    ?? null
            case 'google':
                return (user.user_metadata?.name as string | undefined)
                    ?? (user.user_metadata?.real_email as string | undefined)
                    ?? null
            default:
                return null
        }
    })()

    // OAuth 프로필에서 가져온 실제 이메일 (알림 수신용 pre-fill)
    const oauthEmail = (() => {
        switch (provider) {
            case 'naver': return (user.user_metadata?.naver_email as string | undefined) ?? null
            case 'kakao': return (user.user_metadata?.real_email as string | undefined) ?? null
            case 'google': return (user.user_metadata?.real_email as string | undefined) ?? null
            default: return null
        }
    })()

    return (
        <OnboardingClient
            initialNickname={initialNickname}
            provider={provider ?? null}
            providerAccount={providerAccount}
            oauthEmail={oauthEmail}
        />
    )
}
