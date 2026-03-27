/**
 * app/sports/page.tsx
 * 
 * [스포츠 카테고리 페이지]
 * 
 * 스포츠 카테고리에 속한 이슈들만 보여주는 페이지입니다.
 */

import IssueList from '@/components/issues/IssueList'

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

export default function SportsPage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl font-bold text-content-primary mb-6">스포츠 이슈</h1>
            <IssueList category="스포츠" />
        </div>
    )
}
