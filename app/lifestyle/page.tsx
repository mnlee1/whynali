/**
 * app/lifestyle/page.tsx
 * 
 * [생활/문화 카테고리 페이지]
 * 
 * 생활/문화 카테고리에 속한 이슈들만 보여주는 페이지입니다.
 */

import IssueList from '@/components/issues/IssueList'

export default function LifestylePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 mb-6">생활/문화 이슈</h1>
            <IssueList category="생활문화" />
        </div>
    )
}
