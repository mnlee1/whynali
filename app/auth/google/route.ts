/**
 * app/auth/google/route.ts
 *
 * 구글 OAuth 인증 요청. GET 시 구글 로그인 페이지로 리다이렉트한다.
 * 콜백은 /auth/callback/google 에서 처리.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export async function GET(request: NextRequest) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
        return NextResponse.json(
            { error: '구글 로그인이 설정되지 않았습니다.' },
            { status: 503 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/auth/callback/google`
    const state = crypto.randomUUID()

    const searchParams = request.nextUrl.searchParams
    const next = searchParams.get('next') ?? '/'

    const cookieStore = await cookies()
    cookieStore.set('google_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    })
    cookieStore.set('google_oauth_next', next, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    })

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state,
        access_type: 'online',
    })

    return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
}
