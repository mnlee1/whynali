/**
 * middleware.ts
 *
 * 경로별 인증/인가 미들웨어
 *
 * - /admin/*         : 관리자 페이지. 비인증 → /login 리다이렉트, 비관리자 → / 리다이렉트
 * - /api/admin/*     : 관리자 API. 비인증 → 401, 비관리자 → 403
 * - PROTECTED_PATHS  : 로그인 필요 API (쓰기 전용). 비인증 → 401
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAdminEmail } from '@/lib/admin'

/* 로그인이 필요한 API 경로 목록 (GET 제외, 쓰기 전용) */
const PROTECTED_PATHS = [
    '/api/comments',
    '/api/reactions',
    '/api/votes',
    '/api/discussions',
    '/api/reports',
]

function isUserProtectedPath(pathname: string) {
    return PROTECTED_PATHS.some((path) => pathname.startsWith(path))
}

/** Supabase 세션 클라이언트 생성 및 사용자 반환 */
async function getSessionUser(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    return { user, supabaseResponse }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    /* ── /admin/* 페이지 경로 보호 ── */
    if (pathname.startsWith('/admin')) {
        const { user, supabaseResponse } = await getSessionUser(request)

        if (!user) {
            const loginUrl = new URL('/login', request.url)
            loginUrl.searchParams.set('next', pathname)
            return NextResponse.redirect(loginUrl)
        }

        if (!isAdminEmail(user.email)) {
            return NextResponse.redirect(new URL('/', request.url))
        }

        return supabaseResponse
    }

    /* ── /api/admin/* API 경로 보호 ── */
    if (pathname.startsWith('/api/admin')) {
        const { user } = await getSessionUser(request)

        if (!user) {
            return NextResponse.json(
                { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
                { status: 401 }
            )
        }

        if (!isAdminEmail(user.email)) {
            return NextResponse.json(
                { error: 'FORBIDDEN', message: '관리자 권한이 없습니다.' },
                { status: 403 }
            )
        }

        return NextResponse.next()
    }

    /* ── 일반 사용자 쓰기 API 경로 보호 ── */
    if (isUserProtectedPath(pathname) && request.method !== 'GET') {
        const { user, supabaseResponse } = await getSessionUser(request)

        if (!user) {
            return NextResponse.json(
                { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' },
                { status: 401 }
            )
        }

        return supabaseResponse
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*', '/api/:path*'],
}
