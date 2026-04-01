/**
 * app/admin/layout.tsx
 *
 * 관리자 섹션 최상위 레이아웃.
 * 사이드바 없이 children만 렌더. (로그인 등 공통 래퍼 역할)
 * 사이드바가 필요한 페이지는 app/admin/(protected)/layout.tsx 에서 처리.
 */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
