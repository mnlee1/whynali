/**
 * components/issues/IssueCard.tsx
 *
 * [이슈 목록 카드 컴포넌트]
 *
 * 이슈 목록 화면(홈, 연예, 스포츠 등)에서 한 줄씩 보여줄 카드입니다.
 * 상태, 제목, 카테고리, 날짜를 표시합니다.
 *
 * 사용 예시:
 *   <IssueCard issue={issueData} />
 */

import Link from 'next/link'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import { formatDate } from '@/lib/utils/format-date'

interface IssueCardProps {
    issue: Issue
}

export default function IssueCard({ issue }: IssueCardProps) {
    return (
        <Link href={`/issue/${issue.id}`} className="block">
            <article className="p-5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                {/* 상단: 상태 배지 */}
                <div className="mb-2.5">
                    <StatusBadge status={issue.status} size="sm" />
                </div>

                {/* 제목 */}
                <h3 className="text-base font-semibold text-neutral-900 mb-3 line-clamp-2">
                    {decodeHtml(issue.title)}
                </h3>

                {/* 하단: 카테고리 · 날짜 */}
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span>{issue.category}</span>
                    <span>·</span>
                    <span>{formatDate(issue.created_at)}</span>
                </div>
            </article>
        </Link>
    )
}
