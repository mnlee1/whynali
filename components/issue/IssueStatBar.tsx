'use client'

import { useState, useEffect } from 'react'
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
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
    {
        key: 'commentCount' as keyof Stats,
        label: '댓글',
        scrollTo: 'section-comments',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
        ),
    },
    {
        key: 'voteCount' as keyof Stats,
        label: '투표',
        scrollTo: 'section-vote',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
            </svg>
        ),
    },
    {
        key: 'discussionCount' as keyof Stats,
        label: '토론',
        scrollTo: 'section-discussion',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
        ),
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
                <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-content-secondary">
                    {viewStat.icon}
                    <span>{stats.viewCount.toLocaleString()}</span>
                </span>
            )}
        </div>
    )
}
