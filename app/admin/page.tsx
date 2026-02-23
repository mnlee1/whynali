/**
 * app/admin/page.tsx
 * 
 * [관리자 메인 페이지]
 * 
 * 관리자 기능 메뉴를 제공합니다.
 */

import Link from 'next/link'

export default function AdminPage() {
    const menus = [
        {
            title: '이슈 관리',
            description: '이슈 승인·거부·수정·삭제',
            href: '/admin/issues',
            color: 'bg-blue-500',
        },
        {
            title: '수집 현황',
            description: '뉴스·커뮤니티 수집 통계',
            href: '/admin/collections',
            color: 'bg-green-500',
        },
        {
            title: '토론 주제 관리',
            description: '토론 주제 승인·숨김·직접 생성',
            href: '/admin/discussions',
            color: 'bg-purple-500',
        },
        {
            title: '세이프티 관리',
            description: '금칙어 관리·검토 대기 댓글 처리',
            href: '/admin/safety',
            color: 'bg-red-500',
        },
        {
            title: '운영 로그',
            description: '관리자 액션 이력 조회',
            href: '/admin/logs',
            color: 'bg-gray-500',
        },
    ]

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">관리자 페이지</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {menus.map((menu) => (
                    <Link
                        key={menu.href}
                        href={menu.href}
                        className="block p-6 border rounded-lg hover:shadow-lg transition"
                    >
                        <div className={`w-12 h-12 ${menu.color} rounded mb-4`}></div>
                        <h2 className="text-xl font-bold mb-2">{menu.title}</h2>
                        <p className="text-gray-600">{menu.description}</p>
                    </Link>
                ))}
            </div>

            <div className="mt-12 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-bold mb-2">주의사항</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    <li>현재 인증 없이 관리자 페이지에 접근 가능합니다</li>
                    <li>Day 13에 인증 기능이 추가됩니다</li>
                    <li>배포 전에 인증을 반드시 구현해야 합니다</li>
                </ul>
            </div>
        </div>
    )
}
