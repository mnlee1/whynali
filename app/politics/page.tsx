/**
 * app/politics/page.tsx
 * 
 * [정치 카테고리 페이지]
 * 
 * 정치 카테고리에 속한 이슈들만 보여주는 페이지입니다.
 */

import IssueList from '@/components/issues/IssueList'

export default function PoliticsPage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">정치 이슈</h1>
            <IssueList category="정치" />
        </div>
    )
}
