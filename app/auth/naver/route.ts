/**
 * app/auth/naver/route.ts
 *
 * 네이버 OAuth 인증 요청. GET 시 네이버 로그인 페이지로 리다이렉트한다.
 * 콜백은 /auth/callback/naver 에서 처리.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const NAVER_AUTH_URL = 'https://nid.naver.com/oauth2.0/authorize'

export async function GET(request: NextRequest) {
    const clientId = process.env.NAVER_CLIENT_ID
    if (!clientId) {
        return NextResponse.json(
            { error: '네이버 로그인이 설정되지 않았습니다.' },
            { status: 503 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/auth/callback/naver`
    const state = crypto.randomUUID()

    // next 파라미터를 쿠키에 저장하여 콜백에서 사용
    const searchParams = request.nextUrl.searchParams
    const next = searchParams.get('next') ?? '/'
    
    const cookieStore = await cookies()
    cookieStore.set('naver_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    })

    cookieStore.set('naver_oauth_next', next, {
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
        state,
    })

    return NextResponse.redirect(`${NAVER_AUTH_URL}?${params.toString()}`)
}
