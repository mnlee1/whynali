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
import { CheckCircle2, Calendar, ChevronDown, Check } from 'lucide-react'
import type { Vote, VoteChoice } from '@/types'

interface VoteSectionProps {
    issueId: string
    userId: string | null | undefined
}

type VoteWithChoices = Vote & { vote_choices: VoteChoice[] }

export default function VoteSection({ issueId, userId: serverUserId }: VoteSectionProps) {
    const [userId, setUserId] = useState<string | null>(serverUserId ?? null)
    const [votes, setVotes] = useState<VoteWithChoices[]>([])
    const [userVotes, setUserVotes] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState<string | null>(null)
    const [, setError] = useState<string | null>(null)


    useEffect(() => {
        if (serverUserId !== undefined) { setUserId(serverUserId); return }
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
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">투표</h2>
                </div>
                <div className="p-4 space-y-4">
                    {[1, 2].map((i) => (
                        <div key={i} className="rounded-xl p-4 bg-surface-muted/40 space-y-3">
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
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted">
                    <h2 className="text-sm font-bold text-content-primary">투표</h2>
                </div>
                <div className="p-4 flex flex-col items-center justify-center text-center gap-2">
                    <CheckCircle2 className="w-10 h-10 text-content-muted" strokeWidth={1.5} />
                    <p className="text-sm font-semibold text-content-primary">진행 중인 투표가 없습니다</p>
                    <p className="text-xs text-content-secondary">댓글과 반응을 남겨 논란도를 높여보세요!</p>
                </div>
            </div>
        )
    }

    const activeVotes = votes.filter((v) => v.phase === '진행중')
    const pastVotes = votes.filter((v) => v.phase === '마감')


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


                {/* 진행중 투표 */}
                {activeVotes.length > 0 ? (
                    <>
                        {activeVotes.map((vote) => (
                            <VoteCard
                                key={vote.id}
                                vote={vote}
                                myChoiceId={userVotes[vote.id] ?? null}
                                isProcessing={submitting === vote.id}
                                onVote={handleVote}
                                highlight
                            />
                        ))}
                    </>
                ) : pastVotes.length > 0 ? (
                    <div className="flex flex-col items-center justify-center text-center gap-2">
                        <CheckCircle2 className="w-10 h-10 text-content-muted" strokeWidth={1.5} />
                        <p className="text-sm font-semibold text-content-primary">진행 중인 투표가 없습니다</p>
                        <p className="text-xs text-content-secondary">댓글과 반응을 남겨 논란도를 높여보세요!</p>
                    </div>
                ) : null}

                {/* 이전 투표 */}
                {pastVotes.length > 0 && activeVotes.length > 0 && (
                    <div className="pt-4 border-t border-border-muted">
                        <div className="space-y-4 opacity-80">
                            {pastVotes.map((vote) => (
                                <VoteCard
                                    key={vote.id}
                                    vote={vote}
                                    myChoiceId={userVotes[vote.id] ?? null}
                                    isProcessing={false}
                                    onVote={handleVote}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* 진행중 투표가 없고 종료된 투표만 있을 때 */}
                {pastVotes.length > 0 && activeVotes.length === 0 && (
                    <>
                        {pastVotes.map((vote) => (
                            <VoteCard
                                key={vote.id}
                                vote={vote}
                                myChoiceId={userVotes[vote.id] ?? null}
                                isProcessing={false}
                                onVote={handleVote}
                            />
                        ))}
                    </>
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
    onVote: (voteId: string, choiceId: string) => void
    highlight?: boolean
}

function VoteCard({ vote, myChoiceId, isProcessing, onVote, highlight }: VoteCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const choices = vote.vote_choices ?? []
    const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
    const isClosed = vote.phase === '마감'

    // 진행중인 투표는 항상 펼쳐진 상태로 유지
    useEffect(() => {
        if (!isClosed) {
            setIsExpanded(true)
        }
    }, [isClosed])

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
        <div className="rounded-xl transition-all p-4 border border-border">
            {/* 제목 + 상태 배지 */}
            <div className={isClosed && !isExpanded ? '' : 'mb-3'}>
                <div 
                    className={`flex items-center justify-between gap-2 ${isClosed ? 'cursor-pointer' : ''}`}
                    onClick={() => isClosed && setIsExpanded(!isExpanded)}
                >
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            {vote.phase && (
                                <span className={[
                                    'inline-flex items-center px-2 py-0.5 rounded-full border font-medium shrink-0 text-xs',
                                    isClosed
                                        ? 'bg-surface-muted text-content-muted border-border'
                                        : 'bg-purple-50 text-purple-700 border-purple-200'
                                ].join(' ')}>
                                    {isClosed ? '투표 마감' : '투표 진행중'}
                                </span>
                            )}
                            {vote.title && (
                                <p className="font-semibold text-sm">{vote.title}</p>
                            )}
                        </div>
                        {!isClosed && isEndingSoon && (
                            <span className="inline-block text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 font-medium animate-pulse">
                                🔥 {getTimeRemainingText()}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {totalCount > 0 && (
                            <span className="text-xs text-content-primary font-medium">
                                {totalCount.toLocaleString()}표
                            </span>
                        )}
                        {isClosed && (
                            <ChevronDown 
                                className={`w-4 h-4 text-content-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                strokeWidth={2}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* 선택지 영역 - 조건부 렌더링 */}
            {(isExpanded || !isClosed) && (
                <div>
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
                                    'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors overflow-hidden relative',
                                    isSelected
                                        ? 'bg-purple-100 text-purple-800 font-medium'
                                        : 'bg-gray-50 text-content-primary',
                                    disabled
                                        ? 'cursor-not-allowed opacity-60'
                                        : isSelected 
                                            ? 'hover:bg-purple-200 cursor-pointer'
                                            : 'hover:bg-gray-100 cursor-pointer',
                                ].join(' ')}
                            >
                                <span
                                    className={[
                                        'vote-bar absolute inset-y-0 left-0 rounded-xl transition-all',
                                        isSelected ? 'bg-purple-300/60' : 'bg-purple-100',
                                    ].join(' ')}
                                    style={{ '--vote-pct': `${pct}%` } as CSSProperties}
                                />
                                <span className="relative flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        {isSelected && <Check className="w-4 h-4" strokeWidth={2.5} />}
                                        <span>{choice.label}</span>
                                    </span>
                                    {totalCount > 0 && (
                                        <span className={`text-xs ml-2 shrink-0 ${isSelected ? 'text-purple-800 font-medium' : 'text-content-secondary'}`}>
                                            {pct}%
                                        </span>
                                    )}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* 카드 하단 — 자동 종료 안내 */}
                {!isClosed && (autoEndDate || autoEndParticipants) && (
                    <div className="mt-3 text-xs text-content-secondary">
                        {autoEndDate && !isEndingSoon && (
                            <div className="flex justify-end">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 shrink-0" strokeWidth={1.8} />
                                    {new Date(autoEndDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 자동 종료
                                </span>
                            </div>
                        )}
                        {autoEndParticipants && (
                            <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span>목표 {autoEndParticipants.toLocaleString()}명</span>
                                    <span className="font-semibold">{participantProgress}%</span>
                                </div>
                                <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gray-400 rounded-full transition-all duration-500"
                                        style={{ width: `${participantProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>
            )}
        </div>
    )
}
