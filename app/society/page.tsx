/**
 * app/society/page.tsx
 * 
 * [사회 카테고리 페이지]
 * 
 * 사회 카테고리에 속한 이슈들만 보여주는 페이지입니다.
 */

import IssueList from '@/components/issues/IssueList'

export default function SocietyPage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 mb-6">사회 이슈</h1>
            <IssueList category="사회" />
        </div>
    )
}
