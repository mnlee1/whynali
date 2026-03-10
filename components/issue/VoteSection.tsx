'use client'

/**
 * components/issue/VoteSection.tsx
 *
 * 이슈 투표 섹션.
 * - 진행중 투표: 상단에 강조 표시
 * - 종료/마감 투표: 하단 "이전 투표 보기" 접이식 영역으로 분리
 * - 로그인 시 선택/취소 가능, 비율 실시간 그래프 표시
 */

import { useState, useEffect, useCallback, CSSProperties } from 'react'
import type { Vote, VoteChoice } from '@/types'

interface VoteSectionProps {
    issueId: string
    userId: string | null
}

type VoteWithChoices = Vote & { vote_choices: VoteChoice[] }

export default function VoteSection({ issueId, userId: serverUserId }: VoteSectionProps) {
    const [userId, setUserId] = useState<string | null>(serverUserId)
    const [votes, setVotes] = useState<VoteWithChoices[]>([])
    const [userVotes, setUserVotes] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showPast, setShowPast] = useState(false)

    // 전체 참여자 수 계산
    const totalCount = votes
        .filter((v) => v.phase === '진행중')
        .reduce((sum, vote) => {
            const voteTotal = (vote.vote_choices ?? []).reduce((s, c) => s + (c.count ?? 0), 0)
            return sum + voteTotal
        }, 0)

    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

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
        if (!userId) {
            const currentPath = window.location.pathname
            if (confirm('로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?')) {
                window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
            }
            return
        }
        if (submitting) return
        setError(null)

        const alreadyVoted = userVotes[voteId]

        setSubmitting(voteId)
        try {
            if (alreadyVoted === choiceId) {
                // 같은 선택지 클릭 → 투표 취소
                const res = await fetch(`/api/votes/${voteId}/vote`, { method: 'DELETE' })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
            } else if (alreadyVoted && alreadyVoted !== choiceId) {
                // 다른 선택지 클릭 → 기존 투표 취소 후 새로운 선택지에 투표
                const deleteRes = await fetch(`/api/votes/${voteId}/vote`, { method: 'DELETE' })
                const deleteJson = await deleteRes.json()
                if (!deleteRes.ok) throw new Error(deleteJson.error)

                const postRes = await fetch(`/api/votes/${voteId}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vote_choice_id: choiceId }),
                })
                const postJson = await postRes.json()
                if (!postRes.ok) throw new Error(postJson.error)
            } else {
                // 처음 투표
                const res = await fetch(`/api/votes/${voteId}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vote_choice_id: choiceId }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
            }
            
            // 투표 후 데이터 갱신 (투표 카드 순서 + 선택지 순서 유지)
            const res = await fetch(`/api/votes?issue_id=${issueId}`)
            const json = await res.json()
            if (res.ok) {
                const newData: VoteWithChoices[] = json.data ?? []
                setVotes((prev) => {
                    const ordered = prev.map((v) => {
                        const updated = newData.find((nv) => nv.id === v.id)
                        if (!updated) return v
                        const orderedChoices = v.vote_choices.map(
                            (c) => updated.vote_choices.find((nc) => nc.id === c.id) ?? c
                        )
                        return { ...updated, vote_choices: orderedChoices }
                    })
                    const appended = newData.filter((nv) => !prev.find((v) => v.id === nv.id))
                    return [...ordered, ...appended]
                })
                setUserVotes(json.userVotes ?? {})
            }
        } catch (e) {
            alert(e instanceof Error ? e.message : '투표 처리 실패')
        } finally {
            setSubmitting(null)
        }
    }

    if (loading) {
        return (
            <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">투표</p>
                </div>
                <div className="p-4 space-y-4">
                    {[1, 2].map((i) => (
                        <div key={i} className="p-4 border border-gray-200 rounded-xl space-y-3">
                            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                            <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                            <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (votes.length === 0) {
        return null
    }

    const activeVotes = votes.filter((v) => v.phase === '진행중')
    const pastVotes = votes.filter((v) => v.phase === '마감')

    const pastVotesByStatus: Record<string, typeof pastVotes> = {
        '점화': pastVotes.filter((v) => v.issue_status_snapshot === '점화'),
        '논란중': pastVotes.filter((v) => v.issue_status_snapshot === '논란중'),
        '종결': pastVotes.filter((v) => v.issue_status_snapshot === '종결'),
        '기타': pastVotes.filter((v) => !v.issue_status_snapshot),
    }

    return (
        <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                <p className="text-sm font-semibold text-neutral-800">투표</p>
            </div>
            <div className="p-4 space-y-4">
                {/* 참여 유도 메시지 강화 */}
                {!userId && activeVotes.length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-violet-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                ?
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-violet-900 mb-1">
                                    지금 투표에 참여하세요!
                                </p>
                                <p className="text-xs text-violet-700 mb-2">
                                    {totalCount.toLocaleString()}명이 이미 의견을 남겼습니다. 당신의 생각은 어떤가요?
                                </p>
                                <a
                                    href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
                                    className="inline-block px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                                >
                                    로그인하고 투표하기 →
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* 로그인 사용자용 간단 안내 */}
                {userId && activeVotes.length > 0 && (
                    <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                        <p className="text-xs text-violet-700">
                            💡 선택지를 클릭하여 투표하세요. 다시 클릭하면 취소할 수 있습니다.
                        </p>
                    </div>
                )}

                {/* 진행중 투표 */}
                {activeVotes.length > 0 && (
                    <div className="space-y-4">
                        {activeVotes.map((vote) => (
                            <VoteCard
                                key={vote.id}
                                vote={vote}
                                myChoiceId={userVotes[vote.id] ?? null}
                                isProcessing={submitting === vote.id}
                                userId={userId}
                                onVote={handleVote}
                                highlight
                            />
                        ))}
                    </div>
                )}

                {/* 이전 투표 (접이식, 상태별 블록) */}
                {pastVotes.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowPast((p) => !p)}
                            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors"
                        >
                            <span>{showPast ? '▲' : '▼'}</span>
                            <span>이전 투표 {pastVotes.length}개 {showPast ? '접기' : '보기'}</span>
                        </button>

                        {showPast && (
                            <div className="mt-3 space-y-4">
                                {Object.entries(pastVotesByStatus).map(([status, statusVotes]) => {
                                    if (statusVotes.length === 0) return null
                                    return (
                                        <div key={status} className="opacity-80">
                                            <h4 className="text-xs font-semibold text-gray-500 mb-2">
                                                {status} 시기 투표
                                            </h4>
                                            <div className="space-y-3">
                                                {statusVotes.map((vote) => (
                                                    <VoteCard
                                                        key={vote.id}
                                                        vote={vote}
                                                        myChoiceId={userVotes[vote.id] ?? null}
                                                        isProcessing={false}
                                                        userId={userId}
                                                        onVote={handleVote}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── 투표 카드 컴포넌트 ─── */

interface VoteCardProps {
    vote: Vote & { vote_choices: VoteChoice[] }
    myChoiceId: string | null
    isProcessing: boolean
    userId: string | null
    onVote: (voteId: string, choiceId: string) => void
    highlight?: boolean
}

function VoteCard({ vote, myChoiceId, isProcessing, userId, onVote, highlight }: VoteCardProps) {
    const choices = vote.vote_choices ?? []
    const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
    const isClosed = vote.phase === '마감'

    // 자동 종료 정보 계산
    const autoEndDate = vote.auto_end_date ? new Date(vote.auto_end_date) : null
    const autoEndParticipants = vote.auto_end_participants
    const timeRemaining = autoEndDate ? autoEndDate.getTime() - Date.now() : null
    const isEndingSoon = timeRemaining !== null && timeRemaining > 0 && timeRemaining < 24 * 60 * 60 * 1000
    const participantProgress = autoEndParticipants
        ? Math.min(Math.round((totalCount / autoEndParticipants) * 100), 100)
        : null

    // 남은 시간 표시
    const getTimeRemainingText = () => {
        if (!timeRemaining || timeRemaining <= 0) return null
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60))
        const days = Math.floor(hours / 24)
        if (days > 0) return `${days}일 후 종료`
        if (hours > 0) return `${hours}시간 후 종료`
        const minutes = Math.floor(timeRemaining / (1000 * 60))
        return `${minutes}분 후 종료`
    }

    return (
        <div className={[
            'p-4 border rounded-xl transition-all',
            highlight && !isClosed
                ? 'border-violet-300 bg-violet-50/30 shadow-sm'
                : 'border-gray-200 bg-white',
            isEndingSoon && !isClosed ? 'ring-2 ring-orange-200' : '',
        ].join(' ')}>
            {/* 제목 + 상태 배지 */}
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        {vote.phase && (
                            <span className={[
                                'inline-block text-xs px-2 py-0.5 rounded border font-medium shrink-0',
                                isClosed
                                    ? 'bg-gray-50 text-gray-500 border-gray-200'
                                    : 'bg-purple-100 text-purple-700 border-purple-300',
                            ].join(' ')}>
                                {isClosed ? '종료됨' : '진행중'}
                            </span>
                        )}
                        {vote.title && (
                            <p className="font-semibold text-sm">{vote.title}</p>
                        )}
                    </div>
                    {isEndingSoon && !isClosed && (
                        <span className="inline-block text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 font-medium animate-pulse">
                            🔥 {getTimeRemainingText()}
                        </span>
                    )}
                </div>
                {totalCount > 0 && (
                    <span className="text-xs text-gray-400 shrink-0">
                        {totalCount.toLocaleString()}표
                    </span>
                )}
            </div>

            {/* 자동 종료 안내 */}
            {!isClosed && (autoEndDate || autoEndParticipants) && (
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    {autoEndDate && !isEndingSoon && (
                        <p>📅 {new Date(autoEndDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 자동 종료</p>
                    )}
                    {autoEndParticipants && (
                        <div className="mt-1">
                            <div className="flex items-center justify-between mb-1">
                                <span>🎯 목표 {autoEndParticipants.toLocaleString()}명</span>
                                <span className="font-semibold">{participantProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                    style={{ width: `${participantProgress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isClosed && (
                <p className="text-xs text-gray-400 mb-3">이 투표는 종료되었습니다.</p>
            )}

            {/* 선택지 */}
            <div className="space-y-2">
                {choices.map((choice) => {
                    const pct = totalCount > 0
                        ? Math.round((choice.count / totalCount) * 100)
                        : 0
                    const isSelected = myChoiceId === choice.id
                    const disabled = isProcessing || isClosed

                    return (
                        <button
                            key={choice.id}
                            onClick={() => onVote(vote.id, choice.id)}
                            disabled={disabled}
                            className={[
                                'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors overflow-hidden relative',
                                isSelected
                                    ? 'border-violet-400 bg-violet-50 text-violet-800 font-medium'
                                    : 'border-gray-200 bg-white text-gray-700',
                                disabled
                                    ? 'cursor-not-allowed opacity-60'
                                    : 'hover:border-gray-300 cursor-pointer',
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'vote-bar absolute inset-y-0 left-0 rounded transition-all',
                                    isSelected ? 'bg-violet-100' : 'bg-gray-100',
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
        </div>
    )
}
