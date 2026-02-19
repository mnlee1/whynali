'use client'

import Link from 'next/link'
import { useState } from 'react'
import Nav from './Nav'
import SearchBar from './SearchBar'

export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <header className="bg-white border-b sticky top-0 z-50">
            <div className="container mx-auto px-4">
                {/* 모바일: 로고 + 햄버거 */}
                <div className="flex items-center justify-between h-14 md:h-16">
                    <Link href="/" className="text-lg md:text-xl font-bold">
                        왜난리
                    </Link>

                    {/* 데스크톱: 전체 메뉴 */}
                    <div className="hidden md:flex items-center flex-1 justify-between ml-8">
                        <Nav />
                        <div className="flex items-center gap-4">
                            <SearchBar />
                            <button className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                                로그인
                            </button>
                        </div>
                    </div>

                    {/* 모바일: 햄버거 버튼 */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2"
                        aria-label="메뉴"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {mobileMenuOpen ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 6h16M4 12h16M4 18h16"
                                />
                            )}
                        </svg>
                    </button>
                </div>

                {/* 모바일 메뉴 */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t py-4">
                        <Nav mobile onNavigate={() => setMobileMenuOpen(false)} />
                        <div className="mt-4 pt-4 border-t space-y-3">
                            <SearchBar />
                            <button className="w-full px-4 py-2 text-sm border rounded hover:bg-gray-50">
                                로그인
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
