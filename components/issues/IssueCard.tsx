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
            <article className="card-hover p-5 transition-all">
                {/* 상단: 상태 배지 */}
                <div className="mb-2.5">
                    <StatusBadge status={issue.status} size="sm" />
                </div>

                {/* 제목 */}
                <h3 className="text-base font-semibold text-content-primary mb-3 line-clamp-2">
                    {decodeHtml(issue.title)}
                </h3>

                {/* 하단: 카테고리 · 날짜 */}
                <div className="flex items-center gap-2 text-xs text-content-muted mb-3">
                    <span>{issue.category}</span>
                    <span>·</span>
                    <span>{formatDate(issue.created_at)}</span>
                </div>

                {/* 통계 정보 */}
                <div className="flex items-center gap-4 text-xs text-content-secondary pt-3 border-t border-border-muted">
                    {/* 조회수 */}
                    <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{stats ? stats.viewCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 댓글 */}
                    <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                        <span>{stats ? stats.commentCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 투표 */}
                    <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                        </svg>
                        <span>{stats ? stats.voteCount.toLocaleString() : '—'}</span>
                    </span>
                    {/* 토론 */}
                    <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                        </svg>
                        <span>{stats ? stats.discussionCount.toLocaleString() : '—'}</span>
                    </span>
                </div>
            </article>
        </Link>
    )
}
