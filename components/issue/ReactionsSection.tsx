'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReactionType } from '@/types'

interface ReactionsSectionProps {
    issueId: string
    userId: string | null
}

type CountMap = Partial<Record<ReactionType, number>>

const REACTIONS: ReactionType[] = ['좋아요', '싫어요', '화나요', '팝콘각', '응원', '애도', '사이다']

export default function ReactionsSection({ issueId, userId }: ReactionsSectionProps) {
    const [counts, setCounts] = useState<CountMap>({})
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

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
                {REACTIONS.map((type) => {
                    const count = counts[type] ?? 0
                    const selected = userReaction === type
                    return (
                        <button
                            key={type}
                            onClick={() => handleClick(type)}
                            disabled={!userId || submitting}
                            className={[
                                'flex flex-col items-center px-3 py-2 rounded-lg border text-sm min-w-[60px] transition-colors',
                                selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                                    : 'border-gray-200 bg-white text-gray-600',
                                !userId || submitting
                                    ? 'opacity-60 cursor-not-allowed'
                                    : 'hover:border-gray-400 cursor-pointer',
                            ].join(' ')}
                        >
                            <span>{type}</span>
                            {count > 0 && (
                                <span className="text-xs mt-0.5 text-gray-500">{count}</span>
                            )}
                        </button>
                    )
                })}
            </div>
            {!userId && (
                <p className="text-sm text-gray-500 mt-3">
                    <a href="/login" className="text-blue-600 underline">로그인</a>하면 감정을 표현할 수 있습니다.
                </p>
            )}
        </div>
    )
}
