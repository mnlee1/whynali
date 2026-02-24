'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReactionType } from '@/types'

interface ReactionsSectionProps {
    issueId: string
    userId: string | null
}

type CountMap = Partial<Record<ReactionType, number>>

const REACTION_META: { type: ReactionType; emoji: string; label: string }[] = [
    { type: '좋아요',     emoji: '👍', label: '좋아요' },
    { type: '싫어요',     emoji: '👎', label: '싫어요' },
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

    const handleClick = async (type: ReactionType) => {
        if (!userId || submitting) return
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
            await loadReactions()
        } catch (e) {
            setError(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex gap-2 flex-wrap">
                {REACTIONS.map((t) => (
                    <div key={t} className="h-14 w-16 rounded-lg bg-gray-100 animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div>
            {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
            <div className="flex gap-2 flex-wrap">
                {REACTION_META.map(({ type, emoji, label }) => {
                    const count = counts[type] ?? 0
                    const selected = userReaction === type
                    return (
                        <button
                            key={type}
                            onClick={() => handleClick(type)}
                            disabled={!userId || submitting}
                            title={label}
                            className={[
                                'flex flex-col items-center px-3 py-2 rounded-xl border transition-colors min-w-[60px]',
                                selected
                                    ? 'border-violet-400 bg-violet-50 scale-105'
                                    : 'border-gray-200 bg-white',
                                !userId || submitting
                                    ? 'opacity-60 cursor-not-allowed'
                                    : 'hover:border-gray-300 hover:scale-105 cursor-pointer',
                            ].join(' ')}
                        >
                            <span className="text-xl leading-none">{emoji}</span>
                            <span className={[
                                'text-xs mt-1',
                                selected ? 'text-violet-700 font-semibold' : 'text-gray-500',
                            ].join(' ')}>
                                {label}
                            </span>
                            {count > 0 && (
                                <span className={[
                                    'text-xs tabular-nums',
                                    selected ? 'text-violet-600 font-medium' : 'text-gray-400',
                                ].join(' ')}>
                                    {count.toLocaleString()}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
            {!userId && (
                <p className="text-sm text-gray-500 mt-3">
                    <a href="/login" className="text-blue-600 underline">로그인</a>하면 감정을 표현할 수 있습니다.
                    로그인했는데도 이 문구가 보이면 페이지를 새로고침해 보세요.
                </p>
            )}
        </div>
    )
}
