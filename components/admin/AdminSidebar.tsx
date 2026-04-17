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
import { Home, ClipboardCheck, Database, MessageCircle, CheckSquare, Video, Shield, FileText } from 'lucide-react'

const NAV_ITEMS = [
    {
        label: '대시보드',
        href: '/admin',
        icon: <Home className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '이슈 관리',
        href: '/admin/issues',
        icon: <ClipboardCheck className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '수집 현황',
        href: '/admin/collections',
        icon: <Database className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '토론 관리',
        href: '/admin/discussions',
        icon: <MessageCircle className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '투표 관리',
        href: '/admin/votes',
        icon: <CheckSquare className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '숏폼 관리',
        href: '/admin/shortform',
        icon: <Video className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '세이프티',
        href: '/admin/safety',
        icon: <Shield className="w-4 h-4 shrink-0" strokeWidth={2} />,
    },
    {
        label: '운영 로그',
        href: '/admin/logs',
        icon: <FileText className="w-4 h-4 shrink-0" strokeWidth={2} />,
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
        </aside>
    )
}
