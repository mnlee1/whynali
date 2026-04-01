/**
 * app/community/[id]/error.tsx
 *
 * [커뮤니티 상세 에러 페이지]
 *
 * 특정 커뮤니티 토론 페이지(/community/[id])에서 데이터 로딩 실패 등의
 * 런타임 에러가 발생했을 때 보여지는 에러 boundary입니다.
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ErrorProps {
    error: Error & { digest?: string }
    reset: () => void
}

export default function CommunityError({ error, reset }: ErrorProps) {
    const router = useRouter()

    useEffect(() => {
        console.error('[Community Error Boundary]', error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
            <span className="text-7xl font-black tracking-tight bg-gradient-primary bg-clip-text text-transparent">
                오류
            </span>
            <h1 className="mt-4 text-xl font-bold text-content-primary">
                토론을 불러오지 못했어요
            </h1>
            <p className="mt-2 text-sm text-content-secondary max-w-xs">
                토론 데이터를 가져오는 중 문제가 발생했습니다.
                잠시 후 다시 시도해 주세요.
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
