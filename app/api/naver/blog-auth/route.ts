/**
 * app/api/naver/blog-auth/route.ts
 *
 * 네이버 블로그 OAuth 최초 토큰 발급용 (1회성)
 *
 * 사용법:
 *   1. GET /api/naver/blog-auth → 네이버 로그인 페이지로 리다이렉트
 *   2. 로그인·권한 승인 후 /api/naver/blog-auth/callback 으로 자동 리다이렉트
 *   3. 화면에 표시된 refresh_token 값을 .env에 NAVER_BLOG_REFRESH_TOKEN으로 저장
 *
 * 사전 준비:
 *   - 네이버 개발자센터 > 애플리케이션 > API 설정 > 네이버 로그인 추가
 *   - '블로그 글쓰기' 권한 체크
 *   - 서비스 URL: {SITE_URL}
 *   - 콜백 URL: {SITE_URL}/api/naver/blog-auth/callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

const NAVER_AUTH_URL = 'https://nid.naver.com/oauth2.0/authorize'
const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'

// GET /api/naver/blog-auth → 네이버 로그인 페이지로 리다이렉트
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const clientId = process.env.NAVER_BLOG_CLIENT_ID
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    if (!clientId) {
        return NextResponse.json({ error: 'NAVER_BLOG_CLIENT_ID 환경변수 미설정' }, { status: 500 })
    }

    const callbackUrl = `${siteUrl}/api/naver/blog-auth/callback`
    const state = crypto.randomUUID()

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUrl,
        state,
    })

    return NextResponse.redirect(`${NAVER_AUTH_URL}?${params}`)
}

// GET /api/naver/blog-auth/callback (별도 route 파일로 처리)
// 아래는 콜백 처리를 위한 별도 파일 필요 없이 동일 라우트에서 처리하는 방식
// → callback/route.ts 별도 생성

export { callbackHandler as POST }

async function callbackHandler(request: NextRequest) {
    return NextResponse.json({ message: 'POST not supported' }, { status: 405 })
}
