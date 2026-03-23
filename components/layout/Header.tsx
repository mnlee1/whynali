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
 *
 * 네이버 뉴스 스타일 2단 구조:
 * 1. 상단 헤더 (배경색): 로고 + 검색 + 유저 정보
 * 2. GNB 바: 카테고리 네비게이션
 *
 * 모바일 (1280px 미만):
 * - 상단 헤더: 로고 + 검색 아이콘 + 유저 아이콘
 * - GNB: 가로 스크롤 가능한 필 버튼 형태
 * - 검색: 돋보기 클릭 시 토글
 */
export default function Header() {
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
    const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const [displayName, setDisplayName] = useState<string | null>(null)
    const [termsAgreedAt, setTermsAgreedAt] = useState<string | null>(null)
    const [userInfoLoading, setUserInfoLoading] = useState(false)
    const router = useRouter()
    const userMenuRef = useRef<HTMLDivElement>(null)
    const userMenuRefDesktop = useRef<HTMLDivElement>(null)
    const sbRef = useRef(
        createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
    )

    useEffect(() => {
        const sb = sbRef.current
        sb.auth.getUser().then((result) => {
            setUser(result.data.user ?? null)
        })

        const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    // user가 바뀔 때마다 /api/auth/me로 display_name(닉네임) 조회
    useEffect(() => {
        if (!user) {
            setDisplayName(null)
            setTermsAgreedAt(null)
            setUserInfoLoading(false)
            return
        }
        setUserInfoLoading(true)
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setDisplayName(data?.displayName ?? null)
                setTermsAgreedAt(data?.termsAgreedAt ?? null)
            })
            .catch(() => {
                setDisplayName(null)
                setTermsAgreedAt(null)
            })
            .finally(() => setUserInfoLoading(false))
    }, [user])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const insideMobile = userMenuRef.current?.contains(event.target as Node)
            const insideDesktop = userMenuRefDesktop.current?.contains(event.target as Node)
            if (!insideMobile && !insideDesktop) {
                setMobileUserMenuOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleLogout = async () => {
        await sbRef.current.auth.signOut()
        setUser(null)
        setDisplayName(null)
        router.push('/')
        router.refresh()
    }

    /** 관리자 여부 (@nhnad.com 도메인) */
    const isAdmin = !!user && !!user.email?.toLowerCase().endsWith('@nhnad.com')

    /**
     * 표시 이름: display_name(닉네임) 우선. OAuth 실명은 노출하지 않음.
     * 관리자 표시명은 AuthButton 내에서 별도 처리.
     */
    const getName = (): string => displayName || '유저'

    /** 제공자 표시명 반환 */
    const getProviderName = (u: User): string => {
        const provider = (u.user_metadata?.provider ?? u.app_metadata?.provider) as string | undefined
        switch (provider) {
            case 'google': return '구글'
            case 'kakao': return '카카오'
            case 'naver': return '네이버'
            default: return ''
        }
    }

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

    const AuthButton = ({ mobile = false }: { mobile?: boolean }) => {
        // 유저 정보 로딩 중에는 아무것도 렌더하지 않음 (이름 깜빡임 방지)
        if (userInfoLoading) return null

        // 온보딩 미완료(terms_agreed_at 없음) 상태에서는 로그인 버튼으로 표시
        // 관리자는 termsAgreedAt 없어도 통과
        if (!user || (!termsAgreedAt && !isAdmin)) {
            return (
                <Link
                    href="/login"
                    className={mobile
                        ? "p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
                        : "px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 transition-colors"
                    }
                    aria-label={mobile ? "로그인" : undefined}
                >
                    {mobile ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    ) : (
                        "로그인"
                    )}
                </Link>
            )
        }

        // 관리자는 DB의 display_name(운영자A 등 직접 설정한 이름) 우선,
        // 없으면 이메일 앞부분 fallback. 일반 유저는 displayName 우선, 없으면 "유저"
        const name = isAdmin
            ? (displayName || user.email?.split('@')[0] || '운영자')
            : (displayName || '유저')
        // 드롭다운 상단: 버튼과 동일하게 표시
        const dropdownName = name
        // 관리자는 아바타·뱃지 모두 '운' 고정
        const initial = isAdmin ? '운' : dropdownName.charAt(0).toUpperCase()
        const badge = isAdmin
            ? { label: '운', className: 'bg-red-500 text-white' }
            : getProviderBadge(user)

        // 드롭다운 서브텍스트: 관리자는 실제 이메일, 일반 유저는 이메일 또는 제공자명
        // 가짜 합성 이메일 제외 (네이버 이메일 미제공 시 생성한 내부 식별자)
        const subtitleEmail = isAdmin
            ? user.email
            : (user.email && !user.email.endsWith('@naver.oauth') ? user.email : null)
        const subtitleText = subtitleEmail ?? getProviderName(user)

        const dropdownMenu = (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                <div className="px-4 py-3 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{dropdownName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                        {badge && (
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none shrink-0 ${badge.className}`}>
                                {badge.label}
                            </div>
                        )}
                        <span className="text-xs text-neutral-500 truncate">
                            {subtitleText}
                        </span>
                    </div>
                </div>
                <div className="p-2">
                    <Link
                        href="/mypage"
                        onClick={() => setMobileUserMenuOpen(false)}
                        className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded transition-colors"
                    >
                        마이페이지
                    </Link>
                    <button
                        onClick={() => { handleLogout(); setMobileUserMenuOpen(false) }}
                        className="w-full px-3 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-50 rounded transition-colors"
                    >
                        로그아웃
                    </button>
                </div>
            </div>
        )

        if (mobile) {
            return (
                <div ref={userMenuRef} className="relative xl:hidden">
                    <button
                        onClick={() => setMobileUserMenuOpen(!mobileUserMenuOpen)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
                        aria-label="사용자 메뉴"
                    >
                        <div className="relative">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700">
                                {initial}
                            </div>
                            {badge && (
                                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none ${badge.className}`}>
                                    {badge.label}
                                </div>
                            )}
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${mobileUserMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {mobileUserMenuOpen && dropdownMenu}
                </div>
            )
        }

        return (
            <div ref={userMenuRefDesktop} className="relative">
                <button
                    onClick={() => setMobileUserMenuOpen(!mobileUserMenuOpen)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
                    aria-label="사용자 메뉴"
                >
                    <div className="relative">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                            {initial}
                        </div>
                        {badge && (
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold leading-none ${badge.className}`}>
                                {badge.label}
                            </div>
                        )}
                    </div>
                    <span className="hidden xl:inline text-sm font-medium text-neutral-700 max-w-[14ch] truncate">
                        {name}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`hidden xl:block w-3.5 h-3.5 text-neutral-400 transition-transform ${mobileUserMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {mobileUserMenuOpen && dropdownMenu}
            </div>
        )
    }

    return (
        <>
        <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
            <div className="container mx-auto px-4">
                {/* 데스크톱 레이아웃 (1280px 이상) - 1단 구조 */}
                <div className="hidden xl:flex items-center justify-between h-14">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/whynali-logo.png"
                                alt="왜난리"
                                className="h-8 w-auto"
                            />
                        </Link>
                        <Nav />
                    </div>

                    <div className="flex items-center gap-4">
                        <SearchBar />
                        <AuthButton />
                        <Link
                            href={isAdmin ? '/admin' : '/admin/login'}
                            className="px-3 py-1.5 text-sm font-medium border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 transition-colors"
                        >
                            관리자
                        </Link>
                    </div>
                </div>

                {/* 모바일 레이아웃 (1280px 미만) - 2단 구조 */}
                <div className="xl:hidden">
                    {/* 상단 바: 로고 + 검색 + 유저 */}
                    <div className="flex items-center justify-between h-12">
                        <Link href="/" className="flex items-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/whynali-logo.png"
                                alt="왜난리"
                                className="h-6 w-auto"
                            />
                        </Link>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                                className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
                                aria-label="검색"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </button>
                            <AuthButton mobile />
                        </div>
                    </div>

                    {/* GNB 바 */}
                    <div className="border-t border-neutral-100">
                        <div className="overflow-x-auto scrollbar-hide px-4 py-2">
                            <div className="flex gap-4 min-w-max">
                                <Nav mobile />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 모바일 플로팅 검색바 */}
            {mobileSearchOpen && (
                <>
                    {/* 검색바 컨테이너 (GNB 아래에 위치) */}
                    <div className="xl:hidden absolute left-0 right-0 z-50 bg-white shadow-lg border-b border-neutral-200">
                        <div className="container mx-auto px-4 py-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <SearchBar mobile onSearchComplete={() => setMobileSearchOpen(false)} />
                                </div>
                                <button
                                    onClick={() => setMobileSearchOpen(false)}
                                    className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
                                    aria-label="검색 닫기"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </header>

        {/* 모바일 검색 오버레이 (헤더 밖에 위치) */}
        {mobileSearchOpen && (
            <div
                className="xl:hidden fixed inset-0 bg-black/50 z-30"
                style={{ top: 'var(--header-height, 0)' }}
                onClick={() => setMobileSearchOpen(false)}
            />
        )}
        </>
    )
}
