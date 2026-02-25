'use client'

/**
 * app/auth/verify/page.tsx
 *
 * 매직 링크(네이버 로그인 등) 복귀 시 URL 해시의 access_token·refresh_token으로 세션 설정.
 * Supabase가 redirectTo로 보낸 후 해시에 토큰이 붙어 있음.
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

function AuthVerifyContent() {
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

    useEffect(() => {
        const next = searchParams.get('next') ?? '/'
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
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

        supabase.auth
            .setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(() => {
                setStatus('ok')
                window.location.replace(next)
            })
            .catch(() => setStatus('error'))
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
