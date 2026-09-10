'use client'

/**
 * components/common/LoginErrorListener.tsx
 *
 * OAuth 콜백이 실패해 (?login_error=...&next=...) 쿼리와 함께 원래 페이지로 돌아온 경우,
 * 별도 /login 풀페이지로 튕기지 않고 그 자리에서 로그인 모달을 다시 열어 에러를 보여준다.
 * app/layout.tsx에 전역으로 마운트되어 있다.
 */

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { openLoginModal } from '@/lib/loginModalStore'

function LoginErrorListenerInner() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()

    useEffect(() => {
        const error = searchParams.get('login_error')
        if (!error) return

        const next = searchParams.get('next') ?? pathname
        openLoginModal(next, error)

        // 새로고침/뒤로가기 시 에러가 재노출되지 않도록 쿼리 정리
        const params = new URLSearchParams(searchParams)
        params.delete('login_error')
        params.delete('next')
        const query = params.toString()
        router.replace(query ? `${pathname}?${query}` : pathname)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, pathname])

    return null
}

export default function LoginErrorListener() {
    return (
        <Suspense fallback={null}>
            <LoginErrorListenerInner />
        </Suspense>
    )
}
