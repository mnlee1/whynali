'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import Nav from './Nav'
import SearchBar from './SearchBar'

/**
 * Header - 공통 상단바
 * 로고(왼쪽), 네비, 검색·로그인(오른쪽).
 * 로그인 상태: 아바타 + 닉네임 + 로그아웃 버튼 표시.
 * 이메일은 개인정보이므로 노출하지 않음.
 */
export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const [isAdmin, setIsAdmin] = useState(false)
    const router = useRouter()
    const sbRef = useRef(
        createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
    )

    const checkAdmin = async () => {
        try {
            const res = await fetch('/api/auth/is-admin')
            if (res.ok) {
                const data = await res.json()
                setIsAdmin(data.isAdmin === true)
            } else {
                setIsAdmin(false)
            }
        } catch {
            setIsAdmin(false)
        }
    }

    useEffect(() => {
        const sb = sbRef.current
        sb.auth.getUser().then((result) => {
            const currentUser = result.data.user ?? null
            setUser(currentUser)
            if (currentUser) checkAdmin()
        })

        const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
            const currentUser = session?.user ?? null
            setUser(currentUser)
            if (currentUser) {
                checkAdmin()
            } else {
                setIsAdmin(false)
            }
        })

        return () => subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleLogout = async () => {
        await sbRef.current.auth.signOut()
        setUser(null)
        router.push('/')
        router.refresh()
    }

    /**
     * 소셜 로그인 유저 정보에서 표시 이름을 추출.
     * 이메일은 개인정보이므로 헤더에 노출하지 않음.
     * 닉네임 → 전체 이름 → 이메일 로컬 파트 순으로 폴백.
     */
    const getDisplayName = (u: User): string => {
        const raw =
            u.user_metadata?.nickname ||
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            u.email?.split('@')[0] ||
            '유저'
        return String(raw)
    }

    const getAvatarUrl = (u: User): string | null =>
        u.user_metadata?.avatar_url || u.user_metadata?.picture || null

    /**
     * 로그인 제공자 뱃지 정보 반환.
     * 본인에게만 표시되는 정보이므로 개인정보 제3자 제공 이슈 없음.
     * 브랜드 로고 직접 사용이 아닌 이니셜 텍스트로 표시해 브랜드 가이드라인 적용 대상 아님.
     */
    const getProviderBadge = (u: User): { label: string; className: string } | null => {
        // 네이버는 수동 OAuth라 user_metadata.provider에 저장됨.
        // Google/Kakao는 user_metadata.provider가 없어 app_metadata.provider로 fallback.
        const provider = (u.user_metadata?.provider ?? u.app_metadata?.provider) as string | undefined
        switch (provider) {
            case 'google':
                return { label: 'G', className: 'bg-white border border-gray-300 text-blue-600' }
            case 'kakao':
                return { label: 'K', className: 'bg-yellow-300 text-gray-900' }
            case 'naver':
                return { label: 'N', className: 'bg-green-500 text-white' }
            default:
                return null
        }
    }

    const AuthButton = () => {
        if (!user) {
            return (
                <Link
                    href="/login"
                    className="px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                    로그인
                </Link>
            )
        }

        const displayName = getDisplayName(user)
        const avatarUrl = getAvatarUrl(user)
        const initial = displayName.charAt(0).toUpperCase()
        const badge = getProviderBadge(user)

        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                    <div className="relative">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={avatarUrl}
                                alt={displayName}
                                referrerPolicy="no-referrer"
                                className="w-7 h-7 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                                {initial}
                            </div>
                        )}
                        {badge && (
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold leading-none ${badge.className}`}>
                                {badge.label}
                            </div>
                        )}
                    </div>
                    <span className="hidden md:inline text-sm font-medium text-neutral-700 max-w-[10ch] truncate">
                        {displayName}
                    </span>
                </div>
                <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                    로그아웃
                </button>
            </div>
        )
    }

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-12 md:h-14">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="text-lg font-semibold text-violet-700 tracking-tight mr-2">
                            왜난리
                        </Link>
                        <div className="hidden md:flex">
                            <Nav />
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-3">
                        <SearchBar />
                        <AuthButton />
                        {isAdmin && (
                            <Link
                                href="/admin"
                                className="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
                            >
                                관리자
                            </Link>
                        )}
                    </div>

                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 -mr-2 text-neutral-600"
                        aria-label="메뉴"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {mobileMenuOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                {/* 모바일 메뉴 */}
                        </svg>
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-neutral-100 py-4">
                        <Nav mobile onNavigate={() => setMobileMenuOpen(false)} />
                        <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-col gap-3">
                            <SearchBar />
                            {isAdmin && (
                            <Link
                                href="/admin"
                                onClick={() => setMobileMenuOpen(false)}
                                className="block px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded text-center hover:bg-gray-700"
                            >
                                관리자
                            </Link>
                        )}
                            <AuthButton />
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
