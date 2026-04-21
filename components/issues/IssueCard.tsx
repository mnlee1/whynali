/**
 * components/issues/IssueCard.tsx
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, Eye, MessageSquare, MessageCircleMore, BadgeCheck, Users } from 'lucide-react'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'

interface IssueCardProps {
    issue: Issue
}

interface IssueStats {
    viewCount: number
    commentCount: number
    voteCount: number
    discussionCount: number
}

interface DiscussionTopic {
    id: string
    body: string
    viewCount: number
    opinionCount: number
    approval_status: '진행중' | '마감'
    created_at: string
}

export default function IssueCard({ issue }: IssueCardProps) {
    const [stats, setStats] = useState<IssueStats | null>(null)
    const [discussions, setDiscussions] = useState<DiscussionTopic[]>([])

    useEffect(() => {
        async function loadStats() {
            try {
                const res = await fetch(`/api/issues/${issue.id}/stats`)
                if (res.ok) setStats(await res.json())
            } catch { /* 무시 */ }
        }
        async function loadDiscussions() {
            try {
                const res = await fetch(`/api/discussions?issue_id=${issue.id}&limit=10`)
                if (res.ok) {
                    const data = await res.json()
                    const all: DiscussionTopic[] = data.data ?? []
                    const byPopularity = (a: DiscussionTopic, b: DiscussionTopic) =>
                        (b.viewCount + b.opinionCount) - (a.viewCount + a.opinionCount)
                    const byNewest = (a: DiscussionTopic, b: DiscussionTopic) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    const active = all.filter(t => t.approval_status === '진행중').sort(byNewest)
                    const closed = all.filter(t => t.approval_status === '마감').sort(byPopularity)
                    setDiscussions([...active, ...closed].slice(0, 2))
                }
            } catch { /* 무시 */ }
        }
        loadStats()
        loadDiscussions()
    }, [issue.id])

    return (
        <article className="card-hover p-5 transition-all h-full flex flex-col">
            {/* 이슈 영역 → 이슈 상세 */}
            <Link href={`/issue/${issue.id}`} className="block">
                {/* 이슈 제목 */}
                <div className="flex items-center gap-0.5 mb-1.5">
                    <h3 className="text-base font-semibold text-content-primary line-clamp-2">
                        {decodeHtml(issue.title)}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-content-primary shrink-0" strokeWidth={2.5} />
                </div>

                {/* 이슈 내용 요약 */}
                {(issue.topic_description || issue.brief_summary?.intro) && (
                    <p className="text-xs text-content-secondary line-clamp-2 mb-3 leading-relaxed">
                        {issue.topic_description ?? issue.brief_summary!.intro}
                    </p>
                )}

                {/* 이슈 통계 */}
                <div className="flex items-center gap-4 text-xs text-content-secondary mb-3">
                    <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                        {stats ? stats.viewCount.toLocaleString() : '—'}
                    </span>
                    <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
                        {stats ? stats.commentCount.toLocaleString() : '—'}
                    </span>
                    <span className="flex items-center gap-1">
                        <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />
                        {stats ? stats.voteCount.toLocaleString() : '—'}
                    </span>
                    <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" strokeWidth={1.8} />
                        {stats ? stats.discussionCount.toLocaleString() : '—'}
                    </span>
                </div>
            </Link>

            {/* 토론 목록 → 각 토론 상세 */}
            {discussions.length > 0 && (
                <div className="border-t border-border pt-3 space-y-5">
                    {discussions.map((topic) => (
                        <Link
                            key={topic.id}
                            href={`/community/${topic.id}`}
                            className={`block pl-3 border-l-2 transition-colors group ${
                                topic.approval_status === '진행중'
                                    ? 'border-primary'
                                    : 'border-border'
                            }`}
                        >
                            {/* 상태 라벨 */}
                            <div className="mb-1.5">
                                {topic.approval_status === '진행중' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 text-xs font-medium">
                                        토론 진행중
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-surface-muted text-content-muted border-border text-xs font-medium">
                                        토론 마감
                                    </span>
                                )}
                            </div>
                            <p className="text-sm font-medium text-content-primary line-clamp-1 mb-3 group-hover:text-primary transition-colors">
                                {decodeHtml(topic.body)}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-content-secondary">
                                <span className="flex items-center gap-1">
                                    <Eye className="w-4 h-4" strokeWidth={1.8} />
                                    {topic.viewCount}
                                </span>
                                <span className="flex items-center gap-1">
                                    <MessageCircleMore className="w-4 h-4" strokeWidth={1.8} />
                                    {topic.opinionCount}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </article>
    )
}
