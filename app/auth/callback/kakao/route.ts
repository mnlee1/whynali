/**
 * app/auth/callback/kakao/route.ts
 *
 * 카카오 OAuth 콜백. code로 토큰·프로필 조회 후 Supabase 사용자 생성 및 매직 링크로 세션 부여.
 * 카카오 계정은 합성 이메일({kakaoId}@kakao.oauth)로 저장해 동일 이메일의 다른 provider와 독립 계정을 유지한다.
 * 기존 Supabase 네이티브 OAuth로 가입한 유저(sub 매칭)는 마이그레이션: provider_id 추가, 이메일 유지.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
const KAKAO_PROFILE_URL = 'https://kapi.kakao.com/v2/user/me'

type KakaoTokenResponse = {
    access_token: string
    token_type: string
    expires_in: number
    error?: string
    error_description?: string
}

type KakaoProfileResponse = {
    id: number
    kakao_account?: {
        email?: string
        profile?: {
            nickname?: string
        }
    }
}

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const origin = requestUrl.origin
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')

    const cookieStore = await cookies()
    const next = cookieStore.get('kakao_oauth_next')?.value ?? '/'

    const redirectError = (message: string) =>
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))

    if (!code) return redirectError('인증 코드가 없습니다.')

    const savedState = cookieStore.get('kakao_oauth_state')?.value
    if (savedState && state !== savedState) return redirectError('잘못된 요청입니다.')
    cookieStore.delete('kakao_oauth_state')
    cookieStore.delete('kakao_oauth_next')

    const clientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID
    const clientSecret = process.env.KAKAO_CLIENT_SECRET
    if (!clientId) return redirectError('카카오 로그인이 설정되지 않았습니다.')

    const redirectUri = `${origin}/auth/callback/kakao`

    // 1. 토큰 발급
    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
    })
    if (clientSecret) tokenBody.set('client_secret', clientSecret)

    const tokenRes = await fetch(KAKAO_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
    })
    if (!tokenRes.ok) return redirectError('토큰 발급에 실패했습니다.')

    const tokenData: KakaoTokenResponse = await tokenRes.json()
    if (tokenData.error) return redirectError(tokenData.error_description ?? tokenData.error)

    // 2. 프로필 조회
    const profileRes = await fetch(KAKAO_PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!profileRes.ok) return redirectError('프로필 조회에 실패했습니다.')

    const profile: KakaoProfileResponse = await profileRes.json()
    const kakaoId = String(profile.id)
    const kakaoEmail = profile.kakao_account?.email ?? null
    const kakaoNickname = profile.kakao_account?.profile?.nickname ?? null

    if (!kakaoId) return redirectError('카카오 계정 정보를 가져올 수 없습니다.')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return redirectError('서버 설정 오류입니다.')

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3. 기존 유저 탐색
    // - provider_id === kakaoId AND provider === 'kakao' : 커스텀 콜백으로 가입한 유저
    // - sub === kakaoId AND provider === 'kakao'         : 네이티브 OAuth로 가입한 유저 (마이그레이션)
    const syntheticEmail = `${kakaoId}@kakao.oauth`
    const perPage = 50
    let existing: { id: string; email: string; user_metadata?: Record<string, unknown> } | null = null

    for (let page = 1; ; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage })
        const users = data?.users ?? []

        const byProviderId = users.find(
            (u) =>
                (u.user_metadata?.provider_id === kakaoId && u.user_metadata?.provider === 'kakao') ||
                u.email === syntheticEmail
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

        await admin.auth.admin.updateUserById(existing.id, {
            app_metadata: { provider: 'kakao', providers: ['kakao'] },
            user_metadata: {
                ...existing.user_metadata,
                provider: 'kakao',
                provider_id: kakaoId,
                real_email: kakaoEmail,
                kakao_nickname: kakaoNickname,
            },
        })
    } else {
        // 신규 유저: 합성 이메일로 계정 생성
        linkEmail = `${kakaoId}@kakao.oauth`
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
            email: linkEmail,
            email_confirm: true,
            app_metadata: { provider: 'kakao', providers: ['kakao'] },
            user_metadata: { provider: 'kakao', provider_id: kakaoId, real_email: kakaoEmail, kakao_nickname: kakaoNickname },
        })
        if (createError || !newUser.user) {
            return redirectError(createError?.message ?? '계정 생성에 실패했습니다.')
        }
        userId = newUser.user.id

        await admin.from('users').insert({
            id: userId,
            provider: '카카오',
            provider_id: kakaoId,
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
