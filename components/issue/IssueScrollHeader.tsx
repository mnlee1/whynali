'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, BadgeCheck, Users } from 'lucide-react'
import StatusBadge from '@/components/common/StatusBadge'
import ReactionDropdown from '@/components/issue/ReactionDropdown'
import type { IssueStatus } from '@/types/issue'

interface Props {
    title: string
    status: IssueStatus
    issueId: string
    userId: string | null
    initialVoteCount: number
    initialDiscussionCount: number
}

interface Stats {
    commentCount: number
    voteCount: number
    discussionCount: number
}

const NAV_ITEMS = [
    { key: 'commentCount' as keyof Stats,    icon: <MessageSquare className="w-4 h-4" strokeWidth={1.8} />,  scrollTo: 'section-comments' },
    { key: 'voteCount' as keyof Stats,       icon: <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />,     scrollTo: 'section-vote' },
    { key: 'discussionCount' as keyof Stats, icon: <Users className="w-4 h-4" strokeWidth={1.8} />,          scrollTo: 'section-discussion' },
]

export default function IssueScrollHeader({ title, status, issueId, userId, initialVoteCount, initialDiscussionCount }: Props) {
    const [visible, setVisible] = useState(false)
    const [stats, setStats] = useState<Stats>({
        commentCount: 0,
        voteCount: initialVoteCount,
        discussionCount: initialDiscussionCount,
    })
    const [highlightId, setHighlightId] = useState<string | null>(null)

    useEffect(() => {
        const target = document.getElementById('issue-title')
        if (!target) return
        const observer = new IntersectionObserver(
            ([entry]) => setVisible(!entry.isIntersecting),
            { threshold: 0 }
        )
        observer.observe(target)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        fetch(`/api/issues/${issueId}/stats`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data) setStats({ commentCount: data.commentCount, voteCount: data.voteCount, discussionCount: data.discussionCount }) })
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

    const handleClick = (scrollTo: string) => {
        const el = document.getElementById(scrollTo)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setTimeout(() => setHighlightId(scrollTo), 400)
    }

    return (
        <div className={`hidden xl:block fixed left-0 right-0 z-40 bg-surface border-b border-border shadow-sm transition-all duration-200
            xl:top-14
            ${visible ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-4 opacity-0 pointer-events-none'}
        `}>
            <div className="container mx-auto px-4 max-w-2xl">
                <div className="flex items-center justify-between gap-3 py-2">
                    {/* 상태 라벨 + 이슈 타이틀 */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <StatusBadge status={status} size="sm" />
                        <p className="text-base font-semibold text-content-primary truncate">{title}</p>
                    </div>

                    {/* 섹션 네비게이션 — IssueStatBar와 동일한 구성 */}
                    <div className="flex items-center gap-1 shrink-0">
                        <ReactionDropdown issueId={issueId} userId={userId} />
                        {NAV_ITEMS.map(({ key, icon, scrollTo }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleClick(scrollTo)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-content-secondary hover:bg-surface-subtle hover:text-content-primary transition-colors"
                            >
                                {icon}
                                <span>{stats[key] > 0 ? stats[key].toLocaleString() : ''}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
