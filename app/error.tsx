/**
 * app/error.tsx
 *
 * [런타임 에러 페이지 — 앱 전역]
 *
 * 서버/클라이언트 컴포넌트에서 예외가 발생했을 때 보여지는 페이지입니다.
 * Next.js App Router의 error boundary 컨벤션을 따르며,
 * 반드시 'use client' 지시어가 필요합니다.
 * reset() 함수로 해당 세그먼트 재시도가 가능합니다.
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ErrorProps {
    error: Error & { digest?: string }
    reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
    const router = useRouter()

    useEffect(() => {
        console.error('[Error Boundary]', error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
            <span className="text-7xl font-black tracking-tight bg-gradient-primary bg-clip-text text-transparent">
                500
            </span>
            <h1 className="mt-4 text-xl font-bold text-content-primary">
                문제가 발생했어요
            </h1>
            <p className="mt-2 text-sm text-content-secondary max-w-xs">
                일시적인 오류입니다. 잠시 후 다시 시도해 주세요.
            </p>
            {error.digest && (
                <p className="mt-1 text-xs text-content-muted font-mono">
                    오류 코드: {error.digest}
                </p>
            )}
            <div className="flex gap-3 mt-8">
                <button onClick={reset} className="btn btn-md btn-primary">
                    다시 시도
                </button>
                <button onClick={() => router.back()} className="btn btn-md btn-neutral">
                    이전으로
                </button>
            </div>
        </div>
    )
}
