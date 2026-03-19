import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/* OAuth 콜백 — Supabase가 code를 세션으로 교환 후 신규 유저는 온보딩으로 리다이렉트 */
export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next') ?? '/'

    if (!code) {
        return NextResponse.redirect(new URL('/', requestUrl.origin))
    }

    let redirectPath = next
    const response = NextResponse.redirect(new URL(redirectPath, requestUrl.origin))

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (sessionError || !user) {
        console.error('[auth/callback] 세션 오류:', sessionError)
        return NextResponse.redirect(new URL('/', requestUrl.origin))
    }

    console.log('[auth/callback] 유저 로그인:', user.id, user.email)

    // RLS 우회: 세션 교환 직후엔 anon 클라이언트가 users 테이블을 못 읽으므로 서비스 롤로 조회
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: userRows, error: userError } = await adminClient
        .from('users')
        .select('terms_agreed_at, display_name')
        .eq('id', user.id)
        .limit(1)

    const userData = userRows?.[0] ?? null

    // 구 트리거(create_users_on_auth_signup)가 OAuth 실명을 display_name에 저장했던 문제 감지.
    // user_metadata.full_name / name 과 display_name이 일치하면 사용자가 직접 설정한 닉네임이 아님.
    const oauthName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null
    const displayNameIsFromOAuth =
        oauthName &&
        userData?.display_name &&
        userData.display_name === oauthName

    const needsOnboarding =
        !userData ||
        !userData.terms_agreed_at ||
        !userData.display_name ||
        Boolean(displayNameIsFromOAuth)

    // OAuth 실명이 그대로 남아있는 경우 null로 초기화해 온보딩에서 랜덤 닉네임을 배정받게 함
    if (needsOnboarding && displayNameIsFromOAuth) {
        await adminClient
            .from('users')
            .update({ display_name: null })
            .eq('id', user.id)
    }

    console.log('[auth/callback] DB 유저 조회:', {
        userId: user.id,
        userData,
        userError: userError?.message,
        needsOnboarding,
        displayNameIsFromOAuth,
    })

    if (needsOnboarding) {
        console.log('[auth/callback] → /onboarding 리다이렉트')
        const onboardingResponse = NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
        // 세션 쿠키를 새 redirect response에 복사
        response.cookies.getAll().forEach((cookie) => {
            onboardingResponse.cookies.set(cookie.name, cookie.value, cookie)
        })
        return onboardingResponse
    }

    console.log('[auth/callback] → 메인 리다이렉트:', redirectPath)
    return response
}
