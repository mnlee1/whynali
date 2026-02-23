'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import Nav from './Nav'
import SearchBar from './SearchBar'

/**
 * Header - 공통 상단바
 * 로고(왼쪽), 네비, 검색·로그인(오른쪽).
 */
export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const router = useRouter()

    useEffect(() => {
        supabase.auth.getUser().then((result: { data: { user: User | null } }) => setUser(result.data.user ?? null))

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        setUser(null)
        router.push('/')
        router.refresh()
    }

    const AuthButton = () => user ? (
        <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
            로그아웃
        </button>
    ) : (
        <Link href="/login" className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            로그인
        </Link>
    )

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-12 md:h-14">
                    <Link href="/" className="text-lg font-semibold text-neutral-900 tracking-tight">
                        왜난리
                    </Link>

                    <div className="hidden md:flex items-center flex-1 justify-end gap-6 ml-6">
                        <Nav />
                        <div className="flex items-center gap-2">
                            <SearchBar />
                            <Link
                                href="/admin"
                                className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded hover:bg-gray-700"
                            >
                                관리자
                            </Link>
                            <AuthButton />
                    {/* 모바일: 햄버거 버튼 */}
                        </div>
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
                            <Link
                                href="/admin"
                                onClick={() => setMobileMenuOpen(false)}
                                className="block px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded text-center hover:bg-gray-700"
                            >
                                관리자
                            </Link>
                            <AuthButton />
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
