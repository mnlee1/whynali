/**
 * app/admin/(protected)/layout.tsx
 *
 * [관리자 대시보드 레이아웃]
 *
 * 사이드바가 포함된 관리자 전용 레이아웃.
 * - 모바일(md 미만): 데스크톱 전용 안내 메시지 표시
 * - 데스크톱(md 이상): 왼쪽 사이드바 + 오른쪽 콘텐츠 영역
 */

import Link from 'next/link'
import AdminSidebar, { AdminMobileNav } from '@/components/admin/AdminSidebar'

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* 모바일: 데스크톱 전용 안내 */}
            <div className="flex xl:hidden flex-col items-center justify-center min-h-[60vh] px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                </div>
                <h2 className="text-lg font-semibold text-content-primary mb-2">데스크톱에서 이용해주세요</h2>
                <p className="text-sm text-content-secondary mb-6 break-keep">
                    관리자 페이지는 데스크톱 환경에 최적화되어 있습니다.<br />
                    PC 또는 태블릿(가로 모드)에서 접속해주세요.
                </p>
                <Link href="/" className="btn-neutral btn-sm">
                    홈으로 돌아가기
                </Link>
            </div>

            {/* 데스크톱: 관리자 레이아웃 */}
            <div className="hidden xl:block">
                <div className="admin-layout">
                    <div className="admin-container">
                        <AdminSidebar />
                        <main className="admin-main">
                            <div className="admin-content">
                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </>
    )
}
