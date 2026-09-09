'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import LoginOptions from '@/components/common/LoginOptions'

function LoginForm() {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')
    const next = searchParams.get('next') ?? '/'

    return (
        <div className="min-h-[calc(100svh-3rem)] xl:min-h-[calc(100svh-3.5rem)] flex flex-col justify-center items-center px-4 py-8">
            <LoginOptions next={next} error={error} />
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="container mx-auto px-4 py-12 max-w-sm text-center">
                <p className="text-content-secondary">로딩 중...</p>
            </div>
        }>
            <LoginForm />
        </Suspense>
    )
}
