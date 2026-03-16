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
        return NextResponse.redirect(new URL('/', requestUrl.origin))
    }

    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('terms_agreed_at')
        .eq('id', user.id)
        .single()

    if (!userError && userData && !userData.terms_agreed_at) {
        return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
    }

    return response
}
