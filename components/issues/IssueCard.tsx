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
import { Eye, MessageSquare, BadgeCheck, Users } from 'lucide-react'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'


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
            <article className="card-hover p-5 transition-all">
                {/* 상단: 상태 배지 */}
                <div className="mb-2.5">
                    <StatusBadge status={issue.status} size="sm" />
                </div>

                {/* 제목 */}
                <h3 className="text-base font-semibold text-content-primary mb-3 line-clamp-2">
                    {decodeHtml(issue.title)}
                </h3>


                {/* 통계 정보 */}
                <div className="flex items-center gap-4 text-xs text-content-secondary pt-3 border-t border-border-muted">
                    {/* 조회수 */}
                    <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                        <span>{stats ? stats.viewCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 댓글 */}
                    <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
                        <span>{stats ? stats.commentCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 투표 */}
                    <span className="flex items-center gap-1">
                        <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />
                        <span>{stats ? stats.voteCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 토론 */}
                    <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" strokeWidth={1.8} />
                        <span>{stats ? stats.discussionCount.toLocaleString() : '—'}</span>
                    </span>
                </div>
            </article>
        </Link>
    )
}
