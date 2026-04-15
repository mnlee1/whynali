/**
 * lib/shortform/tiktok-token.ts
 *
 * TikTok 액세스 토큰 관리
 * - Supabase app_settings 테이블에 토큰 저장
 * - 만료 시 refresh_token으로 자동 갱신
 *
 * 토큰 우선순위:
 * 1. Supabase app_settings.tiktok_tokens (런타임 갱신 가능)
 * 2. .env.local TIKTOK_ACCESS_TOKEN (초기값 폴백)
 */

import { supabaseAdmin } from '@/lib/supabase/server'

interface TikTokTokens {
    access_token: string
    refresh_token: string
    expires_at: number  // Unix timestamp (ms)
}

const SETTINGS_KEY = 'tiktok_tokens'
const EXPIRE_BUFFER_MS = 5 * 60 * 1000  // 만료 5분 전에 미리 갱신

/**
 * Supabase에서 TikTok 토큰 읽기
 */
async function loadTokensFromDB(): Promise<TikTokTokens | null> {
    const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single()

    if (error || !data) return null

    const v = data.value as any
    if (!v?.access_token || !v?.refresh_token) return null

    return {
        access_token: v.access_token,
        refresh_token: v.refresh_token,
        expires_at: Number(v.expires_at) || 0,
    }
}

/**
 * Supabase에 TikTok 토큰 저장
 */
async function saveTokensToDB(tokens: TikTokTokens): Promise<void> {
    await supabaseAdmin
        .from('app_settings')
        .upsert({
            key: SETTINGS_KEY,
            value: tokens,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
}

/**
 * TikTok refresh_token으로 새 access_token 발급
 * https://developers.tiktok.com/doc/oauth-user-access-token-management
 */
async function refreshTikTokToken(refreshToken: string): Promise<TikTokTokens> {
    const clientKey = process.env.TIKTOK_CLIENT_KEY
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET

    if (!clientKey || !clientSecret) {
        throw new Error('TIKTOK_CLIENT_KEY 또는 TIKTOK_CLIENT_SECRET 환경변수가 없습니다')
    }

    const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    })

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    })

    const json = await response.json()

    if (!response.ok || json.error) {
        throw new Error(`TikTok 토큰 갱신 실패: ${json.error_description || json.error || response.statusText}`)
    }

    const expiresIn = Number(json.expires_in) || 86400  // 기본 24시간
    const tokens: TikTokTokens = {
        access_token: json.access_token,
        refresh_token: json.refresh_token || refreshToken,  // 새 refresh_token 없으면 기존 유지
        expires_at: Date.now() + expiresIn * 1000,
    }

    console.log(`[TikTok Token] 갱신 완료 (만료: ${new Date(tokens.expires_at).toISOString()})`)
    return tokens
}

/**
 * 유효한 TikTok access_token 반환
 * 만료됐거나 5분 이내 만료 예정이면 자동 갱신
 */
export async function getTikTokAccessToken(): Promise<string> {
    // 1. Supabase에서 저장된 토큰 로드
    let tokens = await loadTokensFromDB()

    // 2. DB에 없으면 env 값으로 초기화
    if (!tokens || !tokens.access_token) {
        const envAccessToken = process.env.TIKTOK_ACCESS_TOKEN
        const envRefreshToken = process.env.TIKTOK_REFRESH_TOKEN

        if (!envAccessToken) {
            throw new Error('TikTok Access Token이 없습니다. 어드민에서 토큰을 설정해주세요.')
        }

        tokens = {
            access_token: envAccessToken,
            refresh_token: envRefreshToken || '',
            expires_at: 0,  // 0이면 만료로 간주 → 즉시 갱신 시도
        }
    }

    // 3. 만료 확인 (buffer 포함)
    const isExpired = tokens.expires_at > 0
        ? tokens.expires_at - EXPIRE_BUFFER_MS < Date.now()
        : false  // expires_at=0이면 아직 만료 모름 → 일단 사용해보기

    if (!isExpired) {
        return tokens.access_token
    }

    // 4. 만료됨 → refresh_token으로 갱신
    if (!tokens.refresh_token) {
        console.warn('[TikTok Token] refresh_token 없음 → 기존 access_token 사용 시도')
        return tokens.access_token
    }

    console.log('[TikTok Token] 만료 감지 → refresh_token으로 갱신 중...')
    const newTokens = await refreshTikTokToken(tokens.refresh_token)
    await saveTokensToDB(newTokens)

    return newTokens.access_token
}

/**
 * refresh_token으로 강제 갱신 후 새 access_token 반환
 * tiktok-upload.ts에서 401 발생 시 호출
 */
export async function refreshTikTokAccessToken(): Promise<string> {
    let tokens = await loadTokensFromDB()

    const refreshToken = tokens?.refresh_token || process.env.TIKTOK_REFRESH_TOKEN
    if (!refreshToken) {
        throw new Error('TikTok refresh_token이 없습니다. 어드민에서 토큰을 재설정해주세요.')
    }

    const newTokens = await refreshTikTokToken(refreshToken)
    await saveTokensToDB(newTokens)
    return newTokens.access_token
}

/**
 * 외부에서 토큰 수동 저장 (어드민에서 신규 토큰 입력 시 사용)
 */
export async function saveTikTokTokens(
    accessToken: string,
    refreshToken: string,
    expiresInSeconds: number = 86400
): Promise<void> {
    await saveTokensToDB({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Date.now() + expiresInSeconds * 1000,
    })
    console.log('[TikTok Token] 토큰 수동 저장 완료')
}
