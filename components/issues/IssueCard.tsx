/**
 * components/issues/IssueCard.tsx
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, Eye, MessageSquare, MessageCircleMore, BadgeCheck, Users } from 'lucide-react'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import CategoryBadge from '@/components/common/CategoryBadge'

const NEW_ISSUE_WINDOW_HOURS = 6

export type IssueCardTier = 'hero' | 'medium' | 'normal'

interface IssueCardProps {
    issue: Issue
    tier?: IssueCardTier
}

// 상태별 좌측 강조 바 색상 — 종결은 무채색, 생존 상태는 상태색 유지
const STATUS_ACCENT: Record<Issue['status'], string> = {
    점화: 'bg-red-500',
    논란중: 'bg-[#f97317]',
    종결: 'bg-gray-300',
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

export default function IssueCard({ issue, tier = 'normal' }: IssueCardProps) {
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

    const totalEngagement = stats
        ? stats.viewCount + stats.commentCount + stats.voteCount + stats.discussionCount
        : null
    const hoursSinceCreated = (Date.now() - new Date(issue.created_at).getTime()) / 3600000
    const isNew = totalEngagement === 0 && hoursSinceCreated < NEW_ISSUE_WINDOW_HOURS

    const metrics = stats ? [
        { key: 'view', Icon: Eye, value: stats.viewCount },
        { key: 'comment', Icon: MessageSquare, value: stats.commentCount },
        { key: 'vote', Icon: BadgeCheck, value: stats.voteCount },
        { key: 'discussion', Icon: Users, value: stats.discussionCount },
    ].filter(m => m.value > 0) : []

    const isClosed = issue.status === '종결'

    const paddingClass = tier === 'hero' ? 'p-6 lg:p-8' : tier === 'medium' ? 'p-6' : 'p-5'
    const titleSizeClass = tier === 'hero' ? 'text-xl lg:text-2xl' : tier === 'medium' ? 'text-lg' : 'text-base'
    const titleWeightClass = isClosed ? 'font-medium text-content-secondary' : 'font-bold text-content-primary'
    const summarySizeClass = tier === 'hero' ? 'text-sm' : 'text-[13px]'

    return (
        <article className={`card-hover ${paddingClass} transition-all h-full flex flex-col relative overflow-hidden ${isClosed ? 'grayscale-[50%] opacity-90' : ''}`}>
            {/* 상태 강조 바 */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${STATUS_ACCENT[issue.status]}`} />

            {/* 이슈 영역 → 이슈 상세 */}
            <Link href={`/issue/${issue.id}`} className="block">
                {/* 카테고리 배지 */}
                <div className="mb-2">
                    <CategoryBadge category={issue.category} size="sm" />
                </div>

                {/* 이슈 제목 */}
                <div className="flex items-center gap-1.5 mb-1.5">
                    {isNew && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            NEW
                        </span>
                    )}
                    <h3 className={`${titleSizeClass} ${titleWeightClass} line-clamp-2`}>
                        {decodeHtml(issue.title)}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-content-primary shrink-0" strokeWidth={2.5} />
                </div>

                {/* 이슈 내용 요약 */}
                {(issue.topic_description || issue.brief_summary?.intro) && (
                    <p className={`${summarySizeClass} text-content-secondary line-clamp-1 mb-1.5 leading-relaxed`}>
                        {issue.topic_description ?? issue.brief_summary!.intro}
                    </p>
                )}

                {/* 등록 시각 */}
                <p className="text-[11px] text-content-muted mb-3">
                    {formatDate(issue.created_at)}
                </p>

                {/* 이슈 통계 — 로딩 중엔 스켈레톤, 전부 0이면 행 자체 생략 */}
                {stats === null && (
                    <div className="flex items-center gap-4 text-xs text-content-secondary mb-3">
                        {[0, 1, 2, 3].map(i => (
                            <span key={i} className="h-4 w-8 bg-border-muted rounded animate-pulse" />
                        ))}
                    </div>
                )}
                {metrics.length > 0 && (
                    <div className="flex items-center gap-4 text-xs text-content-secondary mb-3">
                        {metrics.map(({ key, Icon, value }) => (
                            <span key={key} className="flex items-center gap-1">
                                <Icon className="w-4 h-4" strokeWidth={1.8} />
                                {value.toLocaleString()}
                            </span>
                        ))}
                    </div>
                )}
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
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                        토론 진행중
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-subtle text-content-muted text-xs font-bold">
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
