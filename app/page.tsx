/**
 * app/page.tsx
 *
 * [홈 페이지]
 *
 * 메인 화면. 전체 이슈 목록 + 검색/필터/정렬.
 */

import IssueList from '@/components/issues/IssueList'

export default function HomePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 mb-6">
                전체 이슈
            </h1>
            <IssueList />
        </div>
    )
}
