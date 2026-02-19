/**
 * app/page.tsx
 * 
 * [홈 페이지]
 * 
 * 메인 화면으로, 전체 이슈 목록을 보여줍니다.
 * 카테고리 구분 없이 모든 이슈를 표시하며, 검색/필터/정렬 기능을 제공합니다.
 */

import IssueList from '@/components/issues/IssueList'

export default function HomePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            {/* 페이지 제목 */}
            <h1 className="text-2xl md:text-3xl font-bold mb-6">전체 이슈</h1>
            
            {/* 이슈 목록 (카테고리 없음 = 전체) */}
            <IssueList />
        </div>
    )
}
