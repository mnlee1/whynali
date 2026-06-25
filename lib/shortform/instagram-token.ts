/**
 * lib/shortform/instagram-token.ts
 *
 * Instagram 액세스 토큰 관리 (Instagram Login 방식 — whynali-IG 앱)
 * - Supabase app_settings 테이블에 토큰 저장
 * - 단기 토큰(1시간) → 장기 토큰(60일) 자동 교환
 * - 만료 7일 전 자동 갱신
 *
 * 엔드포인트:
 * - 단기→장기 교환: GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 * - 장기 토큰 갱신: GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 *
 * 토큰 우선순위:
 * 1. Supabase app_settings.instagram_tokens (런타임 갱신 가능)
 * 2. .env.local INSTAGRAM_ACCESS_TOKEN (초기값 폴백 → 자동 교환 후 DB 저장)
 */

import { supabaseAdmin } from '@/lib/supabase-server'

interface InstagramTokens {
    access_token: string
    expires_at: number  // Unix timestamp (ms)
}

const SETTINGS_KEY = 'instagram_tokens'
const INSTAGRAM_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000  // 60일
const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000             // 만료 7일 전 갱신

async function loadTokensFromDB(): Promise<InstagramTokens | null> {
    const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single()

    if (error || !data) return null

    const v = data.value as any
    if (!v?.access_token) return null

    return {
        access_token: v.access_token,
        expires_at: Number(v.expires_at) || 0,
    }
}

async function saveTokensToDB(tokens: InstagramTokens): Promise<void> {
    await supabaseAdmin
        .from('app_settings')
        .upsert({
            key: SETTINGS_KEY,
            value: tokens,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
}

/**
 * 단기 토큰(1시간) → 장기 토큰(60일) 교환
 * Instagram Login 앱 전용 엔드포인트 사용
 */
async function exchangeForLongLived(shortLivedToken: string): Promise<InstagramTokens> {
    const appId = process.env.INSTAGRAM_APP_ID
    const appSecret = process.env.INSTAGRAM_APP_SECRET

    if (!appId || !appSecret) {
        throw new Error('INSTAGRAM_APP_ID 또는 INSTAGRAM_APP_SECRET 환경변수가 없습니다')
    }

    const url = new URL('https://graph.instagram.com/access_token')
    url.searchParams.set('grant_type', 'ig_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('access_token', shortLivedToken)

    const response = await fetch(url.toString())
    const json = await response.json()

    if (!response.ok || json.error) {
        const msg = json.error?.message || json.error_description || response.statusText
        throw new Error(`Instagram 장기 토큰 교환 실패: ${msg}`)
    }

    const expiresIn = Number(json.expires_in) || INSTAGRAM_TOKEN_LIFETIME_MS / 1000
    const tokens: InstagramTokens = {
        access_token: json.access_token,
        expires_at: Date.now() + expiresIn * 1000,
    }

    console.log(`[Instagram Token] 장기 토큰 교환 완료 (만료: ${new Date(tokens.expires_at).toISOString()})`)
    return tokens
}

/**
 * 장기 토큰 갱신 (60일 연장)
 * graph.instagram.com/refresh_access_token 사용 — 앱 자격증명 불필요
 */
async function refreshInstagramToken(longLivedToken: string): Promise<InstagramTokens> {
    const url = new URL('https://graph.instagram.com/refresh_access_token')
    url.searchParams.set('grant_type', 'ig_refresh_token')
    url.searchParams.set('access_token', longLivedToken)

    const response = await fetch(url.toString())
    const json = await response.json()

    if (!response.ok || json.error) {
        const msg = json.error?.message || json.error_description || response.statusText
        throw new Error(`Instagram 토큰 갱신 실패: ${msg}`)
    }

    const expiresIn = Number(json.expires_in) || INSTAGRAM_TOKEN_LIFETIME_MS / 1000
    const tokens: InstagramTokens = {
        access_token: json.access_token,
        expires_at: Date.now() + expiresIn * 1000,
    }

    console.log(`[Instagram Token] 갱신 완료 (만료: ${new Date(tokens.expires_at).toISOString()})`)
    return tokens
}

/**
 * 유효한 Instagram access_token 반환.
 * - expires_at=0(신규 단기 토큰): 장기 토큰으로 교환 후 DB 저장
 * - 만료 7일 이내: 자동 갱신
 */
export async function getInstagramAccessToken(): Promise<string> {
    let tokens = await loadTokensFromDB()

    // DB에 없으면 env 값으로 초기화
    if (!tokens || !tokens.access_token) {
        const envToken = process.env.INSTAGRAM_ACCESS_TOKEN
        if (!envToken) {
            throw new Error('Instagram Access Token이 없습니다. Supabase app_settings에 instagram_tokens를 설정해주세요.')
        }
        tokens = { access_token: envToken, expires_at: 0 }
    }

    // expires_at=0 → 단기 토큰이거나 만료 미확인 → 장기 토큰으로 교환
    if (tokens.expires_at === 0) {
        console.log('[Instagram Token] 단기 토큰 감지 → 장기 토큰으로 교환 중...')
        try {
            const longLived = await exchangeForLongLived(tokens.access_token)
            await saveTokensToDB(longLived)
            return longLived.access_token
        } catch (e) {
            console.warn('[Instagram Token] 장기 교환 실패 → 현재 토큰 그대로 사용:', e)
            return tokens.access_token
        }
    }

    // 만료 7일 이내 → 갱신
    const needsRefresh = tokens.expires_at - REFRESH_BUFFER_MS < Date.now()
    if (!needsRefresh) {
        return tokens.access_token
    }

    console.log('[Instagram Token] 만료 임박 → 토큰 갱신 중...')
    const newTokens = await refreshInstagramToken(tokens.access_token)
    await saveTokensToDB(newTokens)
    return newTokens.access_token
}

/**
 * 강제 갱신 (cron에서 호출).
 */
export async function forceRefreshInstagramToken(): Promise<string> {
    const tokens = await loadTokensFromDB()
    const currentToken = tokens?.access_token || process.env.INSTAGRAM_ACCESS_TOKEN
    if (!currentToken) {
        throw new Error('갱신할 Instagram 토큰이 없습니다. 먼저 초기 토큰을 등록해주세요.')
    }

    const newTokens = await refreshInstagramToken(currentToken)
    await saveTokensToDB(newTokens)
    return newTokens.access_token
}

/**
 * 초기 토큰 수동 저장 (최초 1회).
 */
export async function saveInstagramToken(accessToken: string): Promise<void> {
    await saveTokensToDB({
        access_token: accessToken,
        expires_at: Date.now() + INSTAGRAM_TOKEN_LIFETIME_MS,
    })
    console.log('[Instagram Token] 토큰 수동 저장 완료')
}
