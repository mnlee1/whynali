/**
 * components/admin/AdminSidebar.tsx
 *
 * [관리자 네비게이션 컴포넌트]
 *
 * 데스크톱: 왼쪽 고정 사이드바 (md 이상)
 * 모바일: 상단 가로 스크롤 탭 네비 (md 미만)
 * 현재 경로에 따라 활성 메뉴를 하이라이트합니다.
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
    {
        label: '대시보드',
        href: '/admin',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
    },
    {
        label: '이슈 관리',
        href: '/admin/issues',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
        ),
    },
    {
        label: '수집 현황',
        href: '/admin/collections',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
        ),
    },
    {
        label: '토론 주제',
        href: '/admin/discussions',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
        ),
    },
    {
        label: '세이프티',
        href: '/admin/safety',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        ),
    },
    {
        label: '운영 로그',
        href: '/admin/logs',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
    },
]

function useIsActive() {
    const pathname = usePathname()
    return (href: string) => {
        if (href === '/admin') return pathname === '/admin'
        return pathname.startsWith(href)
    }
}

/** 모바일 전용 상단 가로 스크롤 탭 네비 (md 미만에서 표시) */
export function AdminMobileNav() {
    const isActive = useIsActive()

    return (
        <div className="admin-mobile-nav md:hidden">
            <div className="admin-mobile-nav-inner">
                <div className="admin-mobile-nav-scroll">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`admin-mobile-nav-item${isActive(item.href) ? ' admin-mobile-nav-item--active' : ''}`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}

/** 데스크톱 전용 왼쪽 사이드바 (md 이상에서 표시) */
export default function AdminSidebar() {
    const isActive = useIsActive()

    return (
        <aside className="admin-sidebar hidden md:flex md:flex-col">
            <div className="admin-sidebar-header">
                <Link href="/admin" className="admin-sidebar-logo">
                    <span className="admin-sidebar-logo-badge">A</span>
                    <span className="admin-sidebar-logo-text">관리자</span>
                </Link>
            </div>

            <nav className="admin-sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`admin-sidebar-item${isActive(item.href) ? ' admin-sidebar-item--active' : ''}`}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className="admin-sidebar-footer">
                <Link href="/" className="admin-sidebar-back">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>사이트로 돌아가기</span>
                </Link>
            </div>
        </aside>
    )
}
