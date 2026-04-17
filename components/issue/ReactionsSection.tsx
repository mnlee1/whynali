'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReactionType } from '@/types'

interface ReactionsSectionProps {
    issueId: string
    userId: string | null
}

type CountMap = Partial<Record<ReactionType, number>>

const REACTION_META: { type: ReactionType; emoji: string; label: string }[] = [
    { type: '좋아요',     emoji: '😊', label: '좋아요' },
    { type: '싫어요',     emoji: '😞', label: '싫어요' },
    { type: '화나요',     emoji: '😡', label: '화나요' },
    { type: '팝콘각',     emoji: '🍿', label: '팝콘각' },
    { type: '응원',       emoji: '📣', label: '응원' },
    { type: '애도',       emoji: '🕯️', label: '애도' },
    { type: '사이다',     emoji: '🥤', label: '사이다' },
]
const REACTIONS = REACTION_META.map((r) => r.type)

export default function ReactionsSection({ issueId, userId: serverUserId }: ReactionsSectionProps) {
    const [userId, setUserId] = useState<string | null>(serverUserId)
    const [counts, setCounts] = useState<CountMap>({})
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (serverUserId) {
            setUserId(serverUserId)
            return
        }
        fetch('/api/auth/me')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.id) setUserId(data.id)
            })
            .catch(() => {})
    }, [serverUserId])

    const loadReactions = useCallback(async () => {
        try {
            const res = await fetch(`/api/reactions?issue_id=${issueId}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setCounts(json.counts ?? {})
            setUserReaction(json.userReaction ?? null)
        } catch (e) {
            setError(e instanceof Error ? e.message : '감정 조회 실패')
        } finally {
            setLoading(false)
        }
    }, [issueId])

    useEffect(() => { loadReactions() }, [loadReactions])

    useEffect(() => {
        const handleReactionUpdate = (e: CustomEvent) => {
            if (e.detail?.issueId === issueId) {
                console.log('[ReactionsSection] Received reactionUpdated event')
                loadReactions()
            }
        }
        window.addEventListener('reactionUpdated', handleReactionUpdate as EventListener)
        return () => window.removeEventListener('reactionUpdated', handleReactionUpdate as EventListener)
    }, [issueId, loadReactions])

    const handleClick = async (type: ReactionType) => {
        if (!userId) {
            const currentPath = window.location.pathname
            if (confirm('로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?')) {
                window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
            }
            return
        }
        if (submitting) return
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch('/api/reactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: issueId, type }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            console.log('[ReactionsSection] API success:', json)
            await loadReactions()
            console.log('[ReactionsSection] loadReactions completed')
            window.dispatchEvent(new CustomEvent('reactionUpdated', { detail: { issueId } }))
        } catch (e) {
            setError(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-wrap justify-center gap-1 sm:flex-nowrap">
                {REACTIONS.map((t) => (
                    <div key={t} className="h-16 rounded-xl bg-border-muted animate-pulse w-[calc(25%-3px)] min-[480px]:flex-1" />
                ))}
            </div>
        )
    }

    return (
        <div>
            {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
            {/* 480px 미만: 4+3 두 줄 / 480px 이상: 7개 한 줄 */}
            <div className="flex flex-wrap justify-center gap-1 min-[480px]:flex-nowrap">
                {REACTION_META.map(({ type, emoji, label }) => {
                    const count = counts[type] ?? 0
                    const selected = userReaction === type
                    return (
                        <button
                            key={type}
                            onClick={() => handleClick(type)}
                            disabled={submitting}
                            title={label}
                            className={[
                                'flex flex-col items-center px-2 py-2 rounded-xl transition-all',
                                'w-[calc(25%-3px)] min-[480px]:flex-1',
                                selected
                                    ? 'bg-purple-50 scale-105'
                                    : 'bg-gray-50',
                                submitting
                                    ? 'opacity-60 cursor-not-allowed'
                                    : 'hover:bg-surface-muted hover:scale-105 cursor-pointer',
                            ].join(' ')}
                        >
                            <span className="text-xl leading-none">{emoji}</span>
                            <span className={[
                                'text-sm mt-1 font-semibold',
                                selected ? 'text-primary' : 'text-content-secondary',
                            ].join(' ')}>
                                {label}
                            </span>
                            <span className={[
                                'text-xs tabular-nums',
                                selected ? 'text-primary font-medium' : 'text-content-muted',
                            ].join(' ')}>
                                {count.toLocaleString()}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
