'use client'

import { useState, useEffect, useCallback, CSSProperties } from 'react'
import type { Vote, VoteChoice } from '@/types'

interface VoteSectionProps {
    issueId: string
    userId: string | null
}

type VoteWithChoices = Vote & { vote_choices: VoteChoice[] }

export default function VoteSection({ issueId, userId }: VoteSectionProps) {
    const [votes, setVotes] = useState<VoteWithChoices[]>([])
    /* vote_id → 선택한 vote_choice_id */
    const [userVotes, setUserVotes] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState<string | null>(null) // 처리 중인 vote_id
    const [error, setError] = useState<string | null>(null)

    const loadVotes = useCallback(async () => {
        try {
            const res = await fetch(`/api/votes?issue_id=${issueId}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setVotes(json.data ?? [])
            setUserVotes(json.userVotes ?? {})
        } catch (e) {
            setError(e instanceof Error ? e.message : '투표 조회 실패')
        } finally {
            setLoading(false)
        }
    }, [issueId])

    useEffect(() => { loadVotes() }, [loadVotes])

    const handleVote = async (voteId: string, choiceId: string) => {
        if (!userId || submitting) return
        setError(null)

        const alreadyVoted = userVotes[voteId]

        /* 다른 선택지 클릭 시 재투표 불가 안내 */
        if (alreadyVoted && alreadyVoted !== choiceId) {
            setError('이미 투표하셨습니다. 선택을 취소하려면 현재 선택 항목을 다시 클릭하세요.')
            return
        }

        setSubmitting(voteId)
        try {
            if (alreadyVoted === choiceId) {
                /* 같은 선택지 재클릭 → 취소 */
                const res = await fetch(`/api/votes/${voteId}/vote`, { method: 'DELETE' })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
            } else {
                /* 신규 투표 */
                const res = await fetch(`/api/votes/${voteId}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vote_choice_id: choiceId }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
            }
            await loadVotes()
        } catch (e) {
            setError(e instanceof Error ? e.message : '투표 처리 실패')
        } finally {
            setSubmitting(null)
        }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2].map((i) => (
                    <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-3">
                        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                        <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                        <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
            </div>
        )
    }

    if (votes.length === 0) {
        return (
            <p className="text-sm text-gray-500 py-2">등록된 투표가 없습니다.</p>
        )
    }

    return (
        <div className="space-y-4">
            {!userId && (
                <p className="text-sm text-gray-500">
                    <a href="/login" className="text-blue-600 underline">로그인</a>하면 투표할 수 있습니다.
                </p>
            )}
            {votes.map((vote) => {
                const choices = vote.vote_choices ?? []
                const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
                const myChoiceId = userVotes[vote.id] ?? null
                const isProcessing = submitting === vote.id

                return (
                    <div key={vote.id} className="p-4 border border-gray-200 rounded-lg">
                        {vote.title && (
                            <p className="font-semibold text-sm mb-1">{vote.title}</p>
                        )}
                        {vote.phase && (
                            <span className="inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded mb-3">
                                {vote.phase}
                            </span>
                        )}
                        <div className="space-y-2">
                            {choices.map((choice) => {
                                const pct = totalCount > 0
                                    ? Math.round((choice.count / totalCount) * 100)
                                    : 0
                                const isSelected = myChoiceId === choice.id

                                return (
                                    <button
                                        key={choice.id}
                                        onClick={() => handleVote(vote.id, choice.id)}
                                        disabled={!userId || isProcessing}
                                        className={[
                                            'w-full text-left px-3 py-2 rounded border text-sm transition-colors overflow-hidden relative',
                                            isSelected
                                                ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
                                                : 'border-gray-200 bg-white text-gray-700',
                                            !userId || isProcessing
                                                ? 'cursor-not-allowed opacity-60'
                                                : 'hover:border-gray-400 cursor-pointer',
                                        ].join(' ')}
                                    >
                                        {/* 비율 바 (배경) — vote-bar 클래스로 --vote-pct 변수 참조 */}
                                        <span
                                            className={[
                                                'vote-bar absolute inset-y-0 left-0 rounded transition-all',
                                                isSelected ? 'bg-blue-100' : 'bg-gray-100',
                                            ].join(' ')}
                                            style={{ '--vote-pct': `${pct}%` } as CSSProperties}
                                        />
                                        <span className="relative flex justify-between">
                                            <span>{choice.label}</span>
                                            {totalCount > 0 && (
                                                <span className="text-xs text-gray-500 ml-2">
                                                    {pct}%
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        {totalCount > 0 && (
                            <p className="text-xs text-gray-400 mt-2 text-right">
                                총 {totalCount.toLocaleString()}표
                            </p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
