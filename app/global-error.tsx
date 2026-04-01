/**
 * app/global-error.tsx
 *
 * [글로벌 에러 페이지 — 루트 레이아웃 레벨]
 *
 * app/layout.tsx 자체에서 에러가 발생할 때 동작하는 최후 방어선입니다.
 * 루트 레이아웃을 대체하므로 html/body 태그를 직접 포함해야 합니다.
 * 반드시 'use client' 지시어가 필요합니다.
 */

'use client'

import { useEffect } from 'react'

interface GlobalErrorProps {
    error: Error & { digest?: string }
    reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => {
        console.error('[Global Error Boundary]', error)
    }, [error])

    return (
        <html lang="ko">
            <body className="min-h-screen bg-surface-muted text-content-primary antialiased font-pretendard flex items-center justify-center">
                <div className="flex flex-col items-center px-4 py-24 text-center">
                    <span className="text-7xl font-black tracking-tight text-primary">
                        503
                    </span>
                    <h1 className="mt-4 text-xl font-bold text-content-primary">
                        서비스를 불러올 수 없어요
                    </h1>
                    <p className="mt-2 text-sm text-content-secondary max-w-xs">
                        일시적인 서비스 장애입니다. 잠시 후 다시 시도해 주세요.
                    </p>
                    {error.digest && (
                        <p className="mt-1 text-xs text-content-muted font-mono">
                            오류 코드: {error.digest}
                        </p>
                    )}
                    <button onClick={reset} className="btn btn-md btn-primary mt-8">
                        다시 시도
                    </button>
                </div>
            </body>
        </html>
    )
}
