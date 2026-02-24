/**
 * app/admin/layout.tsx
 *
 * [관리자 페이지 공통 레이아웃]
 *
 * 관리자 섹션 전체에 적용되는 레이아웃입니다.
 * - 모바일(md 미만): 상단 가로 스크롤 탭 네비 + 아래 콘텐츠
 * - 데스크톱(md 이상): 왼쪽 사이드바 + 오른쪽 콘텐츠 영역
 */

import AdminSidebar, { AdminMobileNav } from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="admin-layout">
            <AdminMobileNav />
            <div className="admin-container">
                <AdminSidebar />
                <main className="admin-main">
                    <div className="admin-content">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
