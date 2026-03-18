/**
 * components/issues/IssueCard.tsx
 *
 * [이슈 목록 카드 컴포넌트]
 *
 * 이슈 목록 화면(홈, 연예, 스포츠 등)에서 한 줄씩 보여줄 카드입니다.
 * 상태, 제목, 카테고리, 날짜, 통계 정보(조회수, 댓글, 투표, 토론)를 표시합니다.
 *
 * 사용 예시:
 *   <IssueCard issue={issueData} />
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import { formatDate } from '@/lib/utils/format-date'

interface IssueCardProps {
    issue: Issue
}

interface IssueStats {
    viewCount: number
    commentCount: number
    voteCount: number
    discussionCount: number
}

export default function IssueCard({ issue }: IssueCardProps) {
    const [stats, setStats] = useState<IssueStats | null>(null)

    useEffect(() => {
        async function loadStats() {
            try {
                const res = await fetch(`/api/issues/${issue.id}/stats`)
                if (res.ok) {
                    const data = await res.json()
                    setStats(data)
                }
            } catch {
                // 통계 로드 실패 시 무시
            }
        }
        loadStats()
    }, [issue.id])

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
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-3">
                    <span>{issue.category}</span>
                    <span>·</span>
                    <span>{formatDate(issue.created_at)}</span>
                </div>

                {/* 통계 정보 */}
                {stats && (
                    <div className="flex items-center gap-4 text-xs text-neutral-500 pt-3 border-t border-neutral-100">
                        {stats.viewCount > 0 && (
                            <span className="flex items-center gap-1">
                                <span>👁️</span>
                                <span>{stats.viewCount.toLocaleString()}</span>
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <span>💬</span>
                            <span>{stats.commentCount.toLocaleString()}</span>
                        </span>
                        {stats.voteCount > 0 && (
                            <span className="flex items-center gap-1">
                                <span>🗳️</span>
                                <span>{stats.voteCount}</span>
                            </span>
                        )}
                        {stats.discussionCount > 0 && (
                            <span className="flex items-center gap-1">
                                <span>💭</span>
                                <span>{stats.discussionCount}</span>
                            </span>
                        )}
                    </div>
                )}
            </article>
        </Link>
    )
}
