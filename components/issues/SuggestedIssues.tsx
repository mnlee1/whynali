/**
 * components/issues/SuggestedIssues.tsx
 *
 * 추천 이슈 섹션 - "이런 이슈는 어떤가요?"
 *
 * 검색 결과 하단에 표시되는 추천 이슈 카드 목록입니다.
 * 카테고리 페이지(IssueList)와 글로벌 검색(/search) 두 곳에서 공통으로 사용합니다.
 */

'use client'

import Masonry from 'react-masonry-css'
import IssueCard from '@/components/issues/IssueCard'
import type { Issue } from '@/types/issue'

const breakpointColumns = {
    default: 2,
    767: 1,
}

interface SuggestedIssuesProps {
    issues: Issue[]
}

export default function SuggestedIssues({ issues }: SuggestedIssuesProps) {
    if (issues.length === 0) return null

    return (
        <div className="mt-16 pt-12 border-t border-border">
            <p className="text-lg font-semibold text-content-primary mb-4">
                이런 이슈는 어떤가요?
            </p>
            <Masonry
                breakpointCols={breakpointColumns}
                className="flex gap-3 w-auto -ml-3"
                columnClassName="pl-3 bg-clip-padding"
            >
                {issues.map((issue) => (
                    <div key={issue.id} className="mb-3">
                        <IssueCard issue={issue} />
                    </div>
                ))}
            </Masonry>
        </div>
    )
}
