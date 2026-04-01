/**
 * app/auth/callback/google/route.ts
 *
 * 구글 OAuth 콜백. code로 토큰·프로필 조회 후 Supabase 사용자 생성 및 매직 링크로 세션 부여.
 * 구글 계정은 합성 이메일({googleId}@google.oauth)로 저장해 동일 이메일의 다른 provider와 독립 계정을 유지한다.
 * 기존 Supabase 네이티브 OAuth로 가입한 유저(sub 매칭)는 마이그레이션: provider_id 추가, 이메일 유지.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

type GoogleTokenResponse = {
    access_token: string
    token_type: string
    expires_in: number
    scope: string
    error?: string
    error_description?: string
}

type GoogleUserInfo = {
    sub: string
    email?: string
    name?: string
    picture?: string
}

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const origin = requestUrl.origin
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')

    const cookieStore = await cookies()
    const next = cookieStore.get('google_oauth_next')?.value ?? '/'

    const redirectError = (message: string) =>
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))

    if (!code) return redirectError('인증 코드가 없습니다.')

    const savedState = cookieStore.get('google_oauth_state')?.value
    if (savedState && state !== savedState) return redirectError('잘못된 요청입니다.')
    cookieStore.delete('google_oauth_state')
    cookieStore.delete('google_oauth_next')

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return redirectError('구글 로그인이 설정되지 않았습니다.')

    const redirectUri = `${origin}/auth/callback/google`

    // 1. 토큰 발급
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    })
    if (!tokenRes.ok) return redirectError('토큰 발급에 실패했습니다.')

    const tokenData: GoogleTokenResponse = await tokenRes.json()
    if (tokenData.error) return redirectError(tokenData.error_description ?? tokenData.error)

    // 2. 프로필 조회
    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!profileRes.ok) return redirectError('프로필 조회에 실패했습니다.')

    const profile: GoogleUserInfo = await profileRes.json()
    const googleId = profile.sub
    const googleEmail = profile.email ?? null
    const googleName = profile.name ?? null

    if (!googleId) return redirectError('구글 계정 정보를 가져올 수 없습니다.')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return redirectError('서버 설정 오류입니다.')

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3. 기존 유저 탐색
    // - provider_id === googleId AND provider === 'google' : 커스텀 콜백으로 가입한 유저
    // - sub === googleId AND provider === 'google'         : 네이티브 OAuth로 가입한 유저 (마이그레이션)
    const perPage = 50
    let existing: { id: string; email: string; user_metadata?: Record<string, unknown> } | null = null

    for (let page = 1; ; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage })
        const users = data?.users ?? []

        const byProviderId = users.find(
            (u) => u.user_metadata?.provider_id === googleId && u.app_metadata?.provider === 'google'
        )
        if (byProviderId) {
            existing = { id: byProviderId.id, email: byProviderId.email!, user_metadata: byProviderId.user_metadata as Record<string, unknown> }
            break
        }

        if (users.length < perPage) break
    }

    let userId: string
    let linkEmail: string

    if (existing) {
        userId = existing.id
        linkEmail = existing.email

        // 마이그레이션 유저: provider_id 추가, 이메일은 유지(기존 계정 호환)
        // 신규 커스텀 유저: 메타데이터 최신화
        await admin.auth.admin.updateUserById(existing.id, {
            app_metadata: { provider: 'google', providers: ['google'] },
            user_metadata: {
                ...existing.user_metadata,
                provider: 'google',
                provider_id: googleId,
                real_email: googleEmail,
                name: googleName,
            },
        })
    } else {
        // 신규 유저: 합성 이메일로 계정 생성
        linkEmail = `${googleId}@google.oauth`
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
            email: linkEmail,
            email_confirm: true,
            app_metadata: { provider: 'google', providers: ['google'] },
            user_metadata: { provider: 'google', provider_id: googleId, real_email: googleEmail, name: googleName },
        })
        if (createError || !newUser.user) {
            return redirectError(createError?.message ?? '계정 생성에 실패했습니다.')
        }
        userId = newUser.user.id

        await admin.from('users').insert({
            id: userId,
            provider: '구글',
            provider_id: googleId,
            display_name: null,
        })
    }

    // 4. 매직 링크로 세션 부여
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: linkEmail,
        options: { redirectTo: `${origin}/auth/verify?next=${encodeURIComponent(next)}` },
    })

    if (linkError || !linkData?.properties?.action_link) {
        return redirectError(linkError?.message ?? '로그인 링크 생성에 실패했습니다.')
    }

    return NextResponse.redirect(linkData.properties.action_link)
}
