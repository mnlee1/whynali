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
        name?: string
        nickname?: string
        profile_image?: string
    }
}

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const origin = requestUrl.origin
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    const next = requestUrl.searchParams.get('next') ?? '/'

    const redirectError = (message: string) =>
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))

    if (!code) {
        return redirectError('인증 코드가 없습니다.')
    }

    const cookieStore = await cookies()
    const savedState = cookieStore.get('naver_oauth_state')?.value
    if (savedState && state !== savedState) {
        return redirectError('잘못된 요청입니다.')
    }
    cookieStore.delete('naver_oauth_state')

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
    const email = profileJson.response.email ?? `${naverId}@naver.oauth`
    const name = profileJson.response.name ?? profileJson.response.nickname ?? undefined

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
        return redirectError('서버 설정 오류입니다.')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const perPage = 50
    let existing: { id: string; user_metadata?: Record<string, unknown> } | null = null
    for (let page = 1; ; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage })
        const users = data?.users ?? []
        const found = users.find(
            (u) => u.email === email || u.user_metadata?.provider_id === naverId
        )
        if (found) {
            existing = { id: found.id, user_metadata: found.user_metadata as Record<string, unknown> }
            break
        }
        if (users.length < perPage) break
    }

    if (existing) {
        if (!existing.user_metadata?.provider_id) {
            await admin.auth.admin.updateUserById(existing.id, {
                user_metadata: { ...existing.user_metadata, provider_id: naverId },
            })
        }
    } else {
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { provider: 'naver', provider_id: naverId, name },
        })
        if (createError || !newUser.user) {
            return redirectError(createError?.message ?? '계정 생성에 실패했습니다.')
        }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${origin}/auth/verify?next=${encodeURIComponent(next)}` },
    })

    if (linkError || !linkData?.properties?.action_link) {
        return redirectError(linkError?.message ?? '로그인 링크 생성에 실패했습니다.')
    }

    return NextResponse.redirect(linkData.properties.action_link)
}
