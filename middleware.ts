/**
 * middleware.ts
 *
 * 경로별 인증/인가 미들웨어
 *
 * - /admin/login       : 누구나 접근 가능 (관리자 로그인 페이지)
 * - /admin/*           : @nhnad.com 세션 필요. 미인증 → /admin/login 리다이렉트
 * - /api/admin/*       : @nhnad.com 세션 필요. 미인증 → 401/403
 * - PROTECTED_PATHS    : 로그인 필요 API (쓰기 전용). 비인증 → 401
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAdminUser } from '@/lib/admin'

/* 로그인이 필요한 일반 사용자 API 경로 (GET 제외, 쓰기 전용) */
const PROTECTED_PATHS = [
    '/api/comments',
    '/api/reactions',
    '/api/votes',
    '/api/discussions',
    '/api/reports',
]

function isUserProtectedPath(pathname: string) {
    if (pathname.endsWith('/view')) return false
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

    /* ── /admin/login 은 인증 없이 접근 가능 ── */
    if (pathname === '/admin/login') {
        return NextResponse.next()
    }

    /* ── /admin/* 및 /api/admin/* 은 @nhnad.com 세션 필요 ── */
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
        const { user, supabaseResponse } = await getSessionUser(request)

        if (!user) {
            if (pathname.startsWith('/api/admin')) {
                return NextResponse.json(
                    { error: 'UNAUTHORIZED', message: '관리자 로그인이 필요합니다.' },
                    { status: 401 }
                )
            }
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }

        if (!isAdminUser(user)) {
            if (pathname.startsWith('/api/admin')) {
                return NextResponse.json(
                    { error: 'FORBIDDEN', message: '관리자 권한이 없습니다.' },
                    { status: 403 }
                )
            }
            return NextResponse.redirect(new URL('/', request.url))
        }

        return supabaseResponse
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
