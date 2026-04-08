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
            
            const active = (json.data ?? []).filter((v: VoteWithChoices) => v.phase === '진행중')
            const past = (json.data ?? []).filter((v: VoteWithChoices) => v.phase === '마감')
            if (active.length === 0 && past.length > 0) {
                setShowPast(true)
            }
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
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">투표</h2>
                </div>
                <div className="p-4 space-y-4">
                    {[1, 2].map((i) => (
                        <div key={i} className="card p-4 space-y-3">
                            <div className="h-4 w-40 bg-border-muted rounded-full animate-pulse" />
                            <div className="h-8 w-full bg-border-muted rounded-xl animate-pulse" />
                            <div className="h-8 w-full bg-border-muted rounded-xl animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (votes.length === 0) {
        return (
            <div className="card mb-6 p-5 flex flex-col items-center justify-center text-center gap-2 py-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                </svg>
                <p className="text-sm font-semibold text-content-primary">진행 중인 투표가 없습니다</p>
                <p className="text-xs text-content-secondary">댓글과 반응을 남겨 논란도를 높여보세요!</p>
            </div>
        )
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
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-content-primary">투표</h2>
                    {activeVotes.length >= 1 && (
                        <span className="text-xs text-content-muted">{activeVotes.length}</span>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-4">
                {/* 참여 유도 메시지 강화 */}
                {!userId && activeVotes.length > 0 && (
                    <div className="p-4 bg-primary-light border border-primary-muted rounded-xl">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                                ?
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-primary mb-1">
                                    지금 투표에 참여하세요!
                                </p>
                                <p className="text-xs text-primary/80 mb-2">
                                    {totalCount.toLocaleString()}명이 이미 의견을 남겼습니다. 당신의 생각은 어떤가요?
                                </p>
                                <a
                                    href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
                                    className="btn-primary btn-sm inline-flex"
                                >
                                    로그인하고 투표하기 →
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* 로그인 사용자용 간단 안내 */}
                {userId && activeVotes.length > 0 && (
                    <div className="p-3 bg-surface-muted border border-border rounded-xl">
                        <p className="text-xs text-content-secondary">
                            💡 선택지를 클릭하여 투표하세요. 다시 클릭하면 취소할 수 있습니다.
                        </p>
                    </div>
                )}

                {/* 진행중 투표 */}
                {activeVotes.length > 0 ? (
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
                ) : pastVotes.length > 0 ? (
                    <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                        </svg>
                        <p className="text-sm font-semibold text-content-primary">진행 중인 투표가 없습니다</p>
                        <p className="text-xs text-content-secondary">댓글과 반응을 남겨 논란도를 높여보세요!</p>
                    </div>
                ) : null}

                {/* 이전 투표 (접이식, 상태별 블록) */}
                {pastVotes.length > 0 && (
                    <div>
                        {activeVotes.length > 0 && (
                            <button
                                onClick={() => setShowPast((p) => !p)}
                                className="text-sm text-content-muted hover:text-content-secondary flex items-center gap-1.5 transition-colors"
                            >
                                <span>{showPast ? '▲' : '▼'}</span>
                                <span>이전 투표 {pastVotes.length}개 {showPast ? '접기' : '보기'}</span>
                            </button>
                        )}

                        {showPast && (
                            <div className={activeVotes.length > 0 ? "mt-3 space-y-4" : "space-y-4"}>
                                {Object.entries(pastVotesByStatus).map(([status, statusVotes]) => {
                                    if (statusVotes.length === 0) return null
                                    return (
                                        <div key={status} className="opacity-80">
                                            <h4 className="text-xs font-semibold text-content-muted mb-2">
                                                {status === '기타' ? '종료된 투표' : `${status} 시기 투표`}
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
    const [isExpanded, setIsExpanded] = useState(false)
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

    // 종료 날짜 포맷
    const formatEndDate = () => {
        if (!vote.ended_at) return null
        const date = new Date(vote.ended_at)
        const month = date.getMonth() + 1
        const day = date.getDate()
        return `${month}월 ${day}일`
    }

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
            'border rounded-xl transition-all',
            highlight && !isClosed
                ? 'border-primary-muted bg-primary-light/30 shadow-sm'
                : 'border-border bg-surface',
            isEndingSoon && !isClosed ? 'ring-2 ring-orange-200' : '',
        ].join(' ')}>
            {/* 제목 + 상태 배지 (종료된 투표는 클릭 가능) */}
            {isClosed ? (
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left"
                >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {vote.phase && (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 bg-surface-muted text-content-muted border-border">
                                {formatEndDate() ? `종료됨 · ${formatEndDate()}` : '종료됨'}
                            </span>
                        )}
                        {vote.title && (
                            <p className="font-semibold text-sm truncate">{vote.title}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {totalCount > 0 && (
                            <span className="text-xs text-content-muted">
                                {totalCount.toLocaleString()}표
                            </span>
                        )}
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className={`w-4 h-4 text-content-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor" 
                            strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </div>
                </button>
            ) : (
                <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                {vote.phase && (
                                    <span className="inline-block text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 bg-primary-light text-primary border-primary-muted">
                                        진행중
                                    </span>
                                )}
                                {vote.title && (
                                    <p className="font-semibold text-sm">{vote.title}</p>
                                )}
                            </div>
                            {isEndingSoon && (
                                <span className="inline-block text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 font-medium animate-pulse">
                                    🔥 {getTimeRemainingText()}
                                </span>
                            )}
                        </div>
                        {totalCount > 0 && (
                            <span className="text-xs text-content-muted shrink-0">
                                {totalCount.toLocaleString()}표
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* 선택지 영역 (종료된 투표는 펼쳤을 때만 표시) */}
            {(!isClosed || isExpanded) && (
                <div className={isClosed ? "px-4 pb-4" : ""}>
                    {/* 자동 종료 안내 */}
                    {!isClosed && (autoEndDate || autoEndParticipants) && (
                        <div className="mb-3 p-2 bg-surface-subtle border border-border rounded-xl text-xs text-content-secondary">
                            {autoEndDate && !isEndingSoon && (
                                <p>📅 {new Date(autoEndDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 자동 종료</p>
                            )}
                            {autoEndParticipants && (
                                <div className="mt-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span>목표 {autoEndParticipants.toLocaleString()}명</span>
                                        <span className="font-semibold">{participantProgress}%</span>
                                    </div>
                                    <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full transition-all duration-500"
                                            style={{ width: `${participantProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
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
                                        'w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors overflow-hidden relative',
                                        isSelected
                                            ? 'border-primary-muted bg-primary-light text-primary font-medium'
                                            : 'border-border bg-surface text-content-primary',
                                        disabled
                                            ? 'cursor-not-allowed opacity-60'
                                            : 'hover:border-border-strong cursor-pointer',
                                    ].join(' ')}
                                >
                                    <span
                                        className={[
                                            'vote-bar absolute inset-y-0 left-0 rounded-xl transition-all',
                                            isSelected ? 'bg-primary-light' : 'bg-border-muted',
                                        ].join(' ')}
                                        style={{ '--vote-pct': `${pct}%` } as CSSProperties}
                                    />
                                    <span className="relative flex justify-between">
                                        <span>{choice.label}</span>
                                        {totalCount > 0 && (
                                            <span className="text-xs text-content-secondary ml-2">
                                                {pct}%
                                            </span>
                                        )}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
