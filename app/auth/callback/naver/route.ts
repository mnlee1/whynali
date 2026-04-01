/**
 * app/auth/callback/naver/route.ts
 *
 * 네이버 OAuth 콜백. code로 토큰·프로필 조회 후 Supabase 사용자 생성 및 매직 링크로 세션 부여.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me'

type NaverTokenResponse = {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    error?: string
    error_description?: string
}

type NaverProfileResponse = {
    resultcode: string
    message: string
    response?: {
        id: string
        email?: string
        nickname?: string
        profile_image?: string
    }
}

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const origin = requestUrl.origin
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')

    // 쿠키에서 next 파라미터 가져오기
    const cookieStore = await cookies()
    const next = cookieStore.get('naver_oauth_next')?.value ?? '/'

    const redirectError = (message: string) =>
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))

    if (!code) {
        return redirectError('인증 코드가 없습니다.')
    }

    const savedState = cookieStore.get('naver_oauth_state')?.value
    if (savedState && state !== savedState) {
        return redirectError('잘못된 요청입니다.')
    }
    cookieStore.delete('naver_oauth_state')
    cookieStore.delete('naver_oauth_next')

    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        return redirectError('네이버 로그인이 설정되지 않았습니다.')
    }

    const redirectUri = `${origin}/auth/callback/naver`

    const tokenRes = await fetch(NAVER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
            state: state ?? '',
        }),
    })

    if (!tokenRes.ok) {
        return redirectError('토큰 발급에 실패했습니다.')
    }

    const tokenData: NaverTokenResponse = await tokenRes.json()
    if (tokenData.error) {
        return redirectError(tokenData.error_description ?? tokenData.error)
    }

    const profileRes = await fetch(NAVER_PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!profileRes.ok) {
        return redirectError('프로필 조회에 실패했습니다.')
    }

    const profileJson: NaverProfileResponse = await profileRes.json()
    if (profileJson.resultcode !== '00' || !profileJson.response) {
        return redirectError(profileJson.message ?? '프로필을 가져올 수 없습니다.')
    }

    const naverId = profileJson.response.id
    const naverNickname = profileJson.response.nickname ?? null
    const naverEmail = profileJson.response.email ?? null

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
        return redirectError('서버 설정 오류입니다.')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // naverId 기반으로 기존 유저 탐색.
    // 1순위: provider_id + app_metadata.provider 일치
    // 2순위: 합성 이메일(naverId@naver.oauth) 일치 — 메타데이터 불완전 계정도 포착
    const syntheticEmail = `${naverId}@naver.oauth`
    const perPage = 50
    let existing: { id: string; email: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null = null
    for (let page = 1; ; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage })
        const users = data?.users ?? []
        const found = users.find(
            (u) =>
                (u.user_metadata?.provider_id === naverId && u.user_metadata?.provider === 'naver') ||
                u.email === syntheticEmail
        )
        if (found) {
            existing = { id: found.id, email: found.email!, app_metadata: found.app_metadata as Record<string, unknown>, user_metadata: found.user_metadata as Record<string, unknown> }
            break
        }
        if (users.length < perPage) break
    }

    let userId: string
    let linkEmail: string  // generateLink에 사용할 이메일 (Supabase에 저장된 값)

    if (existing) {
        userId = existing.id
        linkEmail = existing.email  // 네이버 프로필 이메일이 아닌 Supabase에 저장된 이메일 사용
        const needsUpdate =
            existing.user_metadata?.provider !== 'naver' ||
            existing.app_metadata?.provider !== 'naver'
        if (needsUpdate || existing.user_metadata?.naver_nickname !== naverNickname || existing.user_metadata?.naver_email !== naverEmail) {
            await admin.auth.admin.updateUserById(existing.id, {
                app_metadata: { provider: 'naver', providers: ['naver'] },
                user_metadata: {
                    ...existing.user_metadata,
                    provider: 'naver',
                    provider_id: naverId,
                    naver_nickname: naverNickname,
                    naver_email: naverEmail,
                },
            })
        }
    } else {
        // 신규 유저: 네이버 프로필 이메일 대신 naverId 기반 고유 이메일 사용
        // (프로필 이메일이 다른 계정과 충돌할 수 있으므로)
        linkEmail = syntheticEmail
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
            email: linkEmail,
            email_confirm: true,
            app_metadata: { provider: 'naver', providers: ['naver'] },
            user_metadata: { provider: 'naver', provider_id: naverId, naver_nickname: naverNickname, naver_email: naverEmail },
        })
        if (createError || !newUser.user) {
            return redirectError(createError?.message ?? '계정 생성에 실패했습니다.')
        }
        userId = newUser.user.id

        await admin.from('users').insert({
            id: userId,
            provider: '네이버',
            provider_id: naverId,
            display_name: null,
        })
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: linkEmail,  // Supabase 저장 이메일 사용 (네이버 프로필 이메일 아님)
        options: { redirectTo: `${origin}/auth/verify?next=${encodeURIComponent(next)}` },
    })

    if (linkError || !linkData?.properties?.action_link) {
        return redirectError(linkError?.message ?? '로그인 링크 생성에 실패했습니다.')
    }

    return NextResponse.redirect(linkData.properties.action_link)
}
