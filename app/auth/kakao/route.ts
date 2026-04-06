/**
 * app/auth/kakao/route.ts
 *
 * 카카오 OAuth 인증 요청. GET 시 카카오 로그인 페이지로 리다이렉트한다.
 * 콜백은 /auth/callback/kakao 에서 처리.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const KAKAO_AUTH_URL = 'https://kauth.kakao.com/oauth/authorize'

export async function GET(request: NextRequest) {
    const clientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID
    if (!clientId) {
        return NextResponse.json(
            { error: '카카오 로그인이 설정되지 않았습니다.' },
            { status: 503 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/auth/callback/kakao`
    const state = crypto.randomUUID()

    const searchParams = request.nextUrl.searchParams
    const next = searchParams.get('next') ?? '/'

    const cookieStore = await cookies()
    cookieStore.set('kakao_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    })
    cookieStore.set('kakao_oauth_next', next, {
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
        scope: 'account_email',
        prompt: 'select_account',
    })

    return NextResponse.redirect(`${KAKAO_AUTH_URL}?${params.toString()}`)
}
