import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('terms_agreed_at')
        .eq('id', user.id)
        .single()

    console.log('[auth/callback] DB 유저 조회:', {
        userId: user.id,
        userData,
        userError: userError?.message,
        needsOnboarding: userData ? !userData.terms_agreed_at : 'no_user_data'
    })

    if (!userError && userData && !userData.terms_agreed_at) {
        console.log('[auth/callback] → /onboarding 리다이렉트')
        return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
    }

    console.log('[auth/callback] → 메인 리다이렉트:', redirectPath)
    return response
}
