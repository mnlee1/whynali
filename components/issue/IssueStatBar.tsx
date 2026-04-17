'use client'

import { useState, useEffect } from 'react'
import { Eye, MessageSquare, BadgeCheck, Users } from 'lucide-react'
import ReactionDropdown from '@/components/issue/ReactionDropdown'

interface IssueStatBarProps {
    issueId: string
    userId: string | null
    initialVoteCount: number
    initialDiscussionCount: number
}

interface Stats {
    viewCount: number
    commentCount: number
    voteCount: number
    discussionCount: number
}

const STATS_META = [
    {
        key: 'viewCount' as keyof Stats,
        label: '조회',
        scrollTo: null,
        icon: <Eye className="w-4 h-4" strokeWidth={1.8} />,
    },
    {
        key: 'commentCount' as keyof Stats,
        label: '댓글',
        scrollTo: 'section-comments',
        icon: <MessageSquare className="w-4 h-4" strokeWidth={1.8} />,
    },
    {
        key: 'voteCount' as keyof Stats,
        label: '투표',
        scrollTo: 'section-vote',
        icon: <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />,
    },
    {
        key: 'discussionCount' as keyof Stats,
        label: '토론',
        scrollTo: 'section-discussion',
        icon: <Users className="w-4 h-4" strokeWidth={1.8} />,
    },
]

export default function IssueStatBar({ issueId, userId, initialVoteCount, initialDiscussionCount }: IssueStatBarProps) {
    const [stats, setStats] = useState<Stats>({
        viewCount: 0,
        commentCount: 0,
        voteCount: initialVoteCount,
        discussionCount: initialDiscussionCount,
    })
    const [highlightId, setHighlightId] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/issues/${issueId}/stats`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data) setStats(data) })
            .catch(() => {})
    }, [issueId])

    useEffect(() => {
        if (!highlightId) return
        const el = document.getElementById(highlightId)
        if (!el) return
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl', 'transition-all')
        const timer = setTimeout(() => {
            el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-xl', 'transition-all')
            setHighlightId(null)
        }, 700)
        return () => clearTimeout(timer)
    }, [highlightId])

    const handleClick = (scrollTo: string | null) => {
        if (!scrollTo) return
        const el = document.getElementById(scrollTo)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })

        setTimeout(() => {
            setHighlightId(scrollTo)
        }, 400)
    }

    const leftStats = STATS_META.filter(({ key }) => key !== 'viewCount')
    const viewStat = STATS_META.find(({ key }) => key === 'viewCount')

    return (
        <div className="flex items-center justify-between gap-2 py-2.5 border-y border-border-muted my-3">
            {/* 좌측 그룹: 감정표현, 댓글, 투표, 토론 */}
            <div className="flex items-center gap-1 flex-wrap">
                <ReactionDropdown issueId={issueId} userId={userId} />
                {leftStats.map(({ key, label, scrollTo, icon }) => {
                    const count = stats[key]
                    const isClickable = !!scrollTo

                    return isClickable ? (
                        <button
                            key={key}
                            type="button"
                            onClick={() => handleClick(scrollTo)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-content-secondary hover:bg-surface-subtle hover:text-content-primary transition-colors"
                        >
                            {icon}
                            <span>{count > 0 ? count.toLocaleString() : label}</span>
                        </button>
                    ) : (
                        <span
                            key={key}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-content-secondary"
                        >
                            {icon}
                            <span>{count > 0 ? count.toLocaleString() : label}</span>
                        </span>
                    )
                })}
            </div>

            {/* 우측 그룹: 조회수 */}
            {viewStat && (
                <span className="flex items-center gap-1 pl-2.5 py-1 text-xs text-content-secondary">
                    {viewStat.icon}
                    <span>{stats.viewCount.toLocaleString()}</span>
                </span>
            )}
        </div>
    )
}
