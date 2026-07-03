/**
 * app/api/naver/blog-auth/callback/route.ts
 *
 * 네이버 OAuth 콜백 처리 — code를 받아 access/refresh token 발급
 * 발급된 refresh_token을 화면에 표시하면 .env에 저장하여 사용
 */

import { NextRequest, NextResponse } from 'next/server'

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
        return new NextResponse(
            `<html><body><h2>인증 거부됨</h2><p>${searchParams.get('error_description')}</p></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    }

    if (!code) {
        return new NextResponse(
            `<html><body><h2>오류</h2><p>code 파라미터 없음</p></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    }

    const clientId = process.env.NAVER_BLOG_CLIENT_ID
    const clientSecret = process.env.NAVER_BLOG_CLIENT_SECRET
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

    if (!clientId || !clientSecret) {
        return new NextResponse(
            `<html><body><h2>오류</h2><p>NAVER_BLOG_CLIENT_ID / CLIENT_SECRET 환경변수 미설정</p></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    }

    const callbackUrl = `${siteUrl}/api/naver/blog-auth/callback`

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        state: state ?? '',
        redirect_uri: callbackUrl,
    })

    const res = await fetch(`${NAVER_TOKEN_URL}?${params}`)
    const json = (await res.json()) as {
        access_token?: string
        refresh_token?: string
        token_type?: string
        expires_in?: string
        error?: string
        error_description?: string
    }

    if (!json.access_token) {
        return new NextResponse(
            `<html><body><h2>토큰 발급 실패</h2><pre>${JSON.stringify(json, null, 2)}</pre></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>네이버 블로그 토큰 발급 완료</title>
<style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px}
code{display:block;background:#f5f5f5;padding:16px;border-radius:8px;word-break:break-all;font-size:13px;margin:8px 0}
.box{border:2px solid #03c75a;border-radius:12px;padding:24px;margin:24px 0}
h1{color:#03c75a}h3{margin-bottom:4px}</style>
</head>
<body>
<h1>✅ 네이버 블로그 토큰 발급 완료</h1>
<div class="box">
  <h3>NAVER_BLOG_REFRESH_TOKEN (아래 값을 .env에 저장)</h3>
  <code>${json.refresh_token}</code>
  <h3 style="margin-top:16px">NAVER_BLOG_ACCESS_TOKEN (참고용, 단기 토큰)</h3>
  <code>${json.access_token}</code>
</div>
<p>📋 <strong>.env.local</strong>에 다음 줄을 추가하세요:</p>
<code>NAVER_BLOG_REFRESH_TOKEN=${json.refresh_token}</code>
<p style="color:#666;font-size:13px">이 페이지는 1회용입니다. refresh_token을 안전하게 보관하세요.</p>
</body>
</html>`

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
