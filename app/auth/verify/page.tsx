'use client'

/**
 * app/auth/verify/page.tsx
 *
 * 네이버 매직 링크 복귀 시 세션 설정.
 * - PKCE 플로우: ?code= 쿼리 파라미터로 exchangeCodeForSession
 * - Implicit 플로우: URL 해시 #access_token, #refresh_token으로 setSession
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

function AuthVerifyContent() {
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

    useEffect(() => {
        const next = searchParams.get('next') ?? '/'

        async function handleAuth() {
            let userId: string | null = null

            // PKCE 플로우: ?code= 파라미터 처리
            const code = searchParams.get('code')
            if (code) {
                const { data, error } = await supabase.auth.exchangeCodeForSession(code)
                if (error || !data.user) {
                    setStatus('error')
                    return
                }
                userId = data.user.id
            } else {
                // Implicit 플로우: URL 해시에서 토큰 추출
                const hash = window.location.hash
                if (!hash) {
                    setStatus('error')
                    return
                }
                const params = new URLSearchParams(hash.replace(/^#/, ''))
                const accessToken = params.get('access_token')
                const refreshToken = params.get('refresh_token')
                if (!accessToken || !refreshToken) {
                    setStatus('error')
                    return
                }
                const { data, error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                })
                if (error || !data.user) {
                    setStatus('error')
                    return
                }
                userId = data.user.id
            }

            if (userId) {
                // admin 클라이언트 경유 API로 온보딩 여부 확인 (RLS 우회, display_name 포함)
                try {
                    const res = await fetch('/api/auth/me')
                    if (res.ok) {
                        const data = await res.json()
                        const needsOnboarding =
                            !data.termsAgreedAt ||
                            !data.displayName ||
                            data.displayNameNeedsReset

                        if (needsOnboarding) {
                            // OAuth 실명이 display_name에 저장된 경우 초기화 후 온보딩으로
                            if (data.displayNameNeedsReset) {
                                await fetch('/api/auth/me', { method: 'PATCH' })
                            }
                            setStatus('ok')
                            window.location.replace('/onboarding')
                            return
                        }
                    }
                } catch {
                    // 조회 실패 시 next로 이동
                }
            }

            setStatus('ok')
            window.location.replace(next)
        }

        handleAuth()
    }, [searchParams])

    if (status === 'error') {
        return (
            <div className="container mx-auto px-4 py-12 max-w-sm text-center">
                <p className="text-gray-600 mb-4">로그인 처리에 실패했습니다.</p>
                <a href="/login" className="text-sm underline">
                    로그인 페이지로
                </a>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-12 max-w-sm text-center">
            <p className="text-gray-600">로그인 처리 중...</p>
        </div>
    )
}

export default function AuthVerifyPage() {
    return (
        <Suspense fallback={
            <div className="container mx-auto px-4 py-12 max-w-sm text-center">
                <p className="text-gray-600">로딩 중...</p>
            </div>
        }>
            <AuthVerifyContent />
        </Suspense>
    )
}
