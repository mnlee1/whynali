/**
 * lib/naver/blog-client.ts
 *
 * 네이버 블로그 글쓰기 API 클라이언트
 *
 * 필요 환경변수:
 *   NAVER_BLOG_CLIENT_ID     — 네이버 개발자센터 앱의 Client ID
 *   NAVER_BLOG_CLIENT_SECRET — 네이버 개발자센터 앱의 Client Secret
 *   NAVER_BLOG_REFRESH_TOKEN — 최초 OAuth 인증 후 발급받은 Refresh Token
 *
 * 사전 작업 (1회):
 *   1. 네이버 개발자센터에서 '네이버 로그인' API 사용 설정, Blog 권한 체크
 *   2. 콜백 URL: {SITE_URL}/api/naver/blog-auth/callback
 *   3. /api/naver/blog-auth 접속 → 인증 → refresh token 발급 → .env에 저장
 */

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
const NAVER_BLOG_API = 'https://openapi.naver.com/blog/writePost'

async function refreshNaverToken(): Promise<string> {
    const clientId = process.env.NAVER_BLOG_CLIENT_ID
    const clientSecret = process.env.NAVER_BLOG_CLIENT_SECRET
    const refreshToken = process.env.NAVER_BLOG_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('[NaverBlog] 환경변수 미설정: NAVER_BLOG_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN')
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    })

    const res = await fetch(`${NAVER_TOKEN_URL}?${params}`)
    const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string }

    if (!json.access_token) {
        throw new Error(`[NaverBlog] 토큰 갱신 실패: ${json.error} - ${json.error_description}`)
    }

    return json.access_token
}

export async function postToNaverBlog(title: string, contents: string): Promise<void> {
    const accessToken = await refreshNaverToken()

    const body = new URLSearchParams({ title, contents })

    const res = await fetch(NAVER_BLOG_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`[NaverBlog] 포스팅 실패 (HTTP ${res.status}): ${text}`)
    }

    console.log('[NaverBlog] 포스팅 완료:', title)
}
