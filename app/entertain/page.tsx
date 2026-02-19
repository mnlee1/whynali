/**
 * app/entertain/page.tsx
 * 
 * [연예 카테고리 페이지]
 * 
 * 연예 카테고리에 속한 이슈들만 보여주는 페이지입니다.
 */

import IssueList from '@/components/issues/IssueList'

export default function EntertainPage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">연예 이슈</h1>
            <IssueList category="연예" />
        </div>
    )
}
