import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/* 로그인이 필요한 API 경로 목록 */
const PROTECTED_PATHS = [
    '/api/comments',
    '/api/reactions',
    '/api/votes',
    '/api/discussions',
    '/api/reports',
]

function isProtectedPath(pathname: string) {
    return PROTECTED_PATHS.some((path) => pathname.startsWith(path))
}

export async function middleware(request: NextRequest) {
    const response = NextResponse.next()

    if (!isProtectedPath(request.nextUrl.pathname) || request.method === 'GET') {
        return response
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    return response
}

export const config = {
    matcher: '/api/:path*',
}
