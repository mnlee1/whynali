/**
 * components/common/LoginOptions.tsx
 *
 * 로그인 옵션(로고, 소셜 로그인 버튼, 약관 안내) 공용 컴포넌트.
 * app/login/page.tsx(풀페이지)와 LoginModal.tsx(헤더 진입 오버레이)에서 함께 사용한다.
 * 버튼 순서는 Kakao → 네이버 → Google 고정, 마지막으로 시도한 provider에만 "최근 로그인" 뱃지를 표시한다.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getLastLoginProvider, setLastLoginProvider, type LoginProvider } from '@/lib/lastLoginProvider'

interface LoginOptionsProps {
    next: string
    error?: string | null
}

const RecentBadge = () => (
    <span className="absolute -top-2.5 -right-2 text-[10px] font-bold bg-content-primary text-white px-3 py-0.5 rounded-full whitespace-nowrap">
        최근 로그인
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-content-primary rotate-45" />
    </span>
)

export default function LoginOptions({ next, error }: LoginOptionsProps) {
    const [lastProvider, setLastProvider] = useState<LoginProvider | null>(null)

    useEffect(() => {
        setLastProvider(getLastLoginProvider())
    }, [])

    const nextParam = next !== '/' ? `?next=${encodeURIComponent(next)}` : ''

    return (
        <div className="w-full max-w-[480px]">
            <div className="text-center mb-8 sm:mb-12">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/whynali-logo.png" alt="왜난리" className="h-12 mx-auto mb-4" />
                <p className="text-base text-content-secondary">
                    지금 일어나는 난리에 참여하세요.
                </p>
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-3 flex flex-col items-center">
                <Link
                    href={`/auth/kakao${nextParam}`}
                    onClick={() => setLastLoginProvider('kakao')}
                    className="relative btn btn-lg w-[320px] gap-3 flex items-center justify-center bg-[#FEE500] text-gray-900 hover:bg-[#F6DC00]"
                >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.61 1.636 4.904 4.125 6.266-.182.676-.66 2.453-.757 2.833-.12.47.173.464.364.338.149-.098 2.367-1.605 3.324-2.255.629.09 1.277.138 1.944.138 5.523 0 10-3.477 10-7.78C21 6.477 17.523 3 12 3z" />
                    </svg>
                    Kakao로 로그인
                    {lastProvider === 'kakao' && <RecentBadge />}
                </Link>

                <Link
                    href={`/auth/naver${nextParam}`}
                    onClick={() => setLastLoginProvider('naver')}
                    className="relative btn btn-lg w-[320px] gap-3 flex items-center justify-center bg-[#03C75A] text-white hover:bg-[#02b350]"
                >
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded bg-white text-[#03C75A] font-bold text-xs">N</span>
                    네이버로 로그인
                    {lastProvider === 'naver' && <RecentBadge />}
                </Link>

                <Link
                    href={`/auth/google${nextParam}`}
                    onClick={() => setLastLoginProvider('google')}
                    className="relative btn-neutral btn-lg w-[320px] gap-3 flex items-center justify-center"
                >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Google로 로그인
                    {lastProvider === 'google' && <RecentBadge />}
                </Link>
            </div>

            <p className="text-xs text-content-muted text-center mt-6 break-keep leading-5">
                로그인과 동시에 <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-content-secondary">서비스 이용약관</Link>과{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-content-secondary">개인정보처리방침</Link>에<br />동의하게 돼요.
            </p>
        </div>
    )
}
