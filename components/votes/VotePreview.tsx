'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import type { Vote, VoteChoice } from '@/types/index'
import Tooltip from '@/components/common/Tooltip'

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

type UserVotes = Record<string, string>

function sortVotes(votes: VoteWithChoices[]): VoteWithChoices[] {
    return votes
        .map(vote => ({
            ...vote,
            _total: (vote.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0),
        }))
        .sort((a, b) => {
            // 진행중 우선, 동일 phase 내에서는 참여 수 내림차순
            if (a.phase !== b.phase) return a.phase === '진행중' ? -1 : 1
            return b._total - a._total
        })
        .slice(0, 5)
}

interface Props {
    initialVotes?: VoteWithChoices[]
}

export default function VotePreview({ initialVotes }: Props) {
    const router = useRouter()
    const [votes, setVotes] = useState<VoteWithChoices[]>(
        initialVotes ? sortVotes(initialVotes) : []
    )
    const [loading, setLoading] = useState(!initialVotes)
    const [userVotes, setUserVotes] = useState<UserVotes>({})
    const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState<Record<string, boolean>>({})

    useEffect(() => {
        async function loadUserVotes() {
            try {
                const res = await fetch('/api/votes?limit=50')
                if (!res.ok) return
                const json = await res.json()
                setUserVotes(json.userVotes ?? {})
                setVotes(sortVotes(json.data ?? []))
            } catch {
                // 실패 시 미투표 상태로 유지
            } finally {
                if (!initialVotes) setLoading(false)
            }
        }
        loadUserVotes()
    }, [initialVotes])

    const handleVote = async (voteId: string, choiceId: string) => {
        setSubmitting(prev => ({ ...prev, [voteId]: true }))
        try {
            const res = await fetch(`/api/votes/${voteId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vote_choice_id: choiceId }),
            })
            if (res.status === 401) {
                router.push('/login')
                return
            }
            if (res.ok || res.status === 201) {
                setUserVotes(prev => ({ ...prev, [voteId]: choiceId }))
                setVotes(prev => prev.map(v => {
                    if (v.id !== voteId) return v
                    return {
                        ...v,
                        vote_choices: v.vote_choices.map(c =>
                            c.id === choiceId ? { ...c, count: c.count + 1 } : c
                        ),
                    }
                }))
            }
        } catch {
            // silent
        } finally {
            setSubmitting(prev => ({ ...prev, [voteId]: false }))
        }
    }

    if (loading) {
        return <div className="h-64 bg-neutral-100 rounded-xl animate-pulse" />
    }

    if (votes.length === 0) {
        return (
            <section className="py-6 md:py-8">
                <div className="container mx-auto">
                    <h2 className="text-[17px] font-bold text-content-primary mb-4">지금 뜨는 투표</h2>
                    <div className="h-40 bg-border-muted rounded-xl flex items-center justify-center">
                        <p className="text-content-muted text-sm">진행 중인 투표가 없습니다.</p>
                    </div>
                </div>
            </section>
        )
    }

    const renderCard = (vote: VoteWithChoices) => {
        const choices = vote.vote_choices ?? []
        const issueId = vote.issues?.id ?? ''
        if (!issueId) return null

        const userChoiceId = userVotes[vote.id]
        const hasVoted = !!userChoiceId
        const isActive = vote.phase === '진행중'
        const showResults = hasVoted || !isActive
        const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
        const sortedByCount = [...choices].sort((a, b) => b.count - a.count)
        const selectedChoiceId = selectedChoices[vote.id]
        const isSubmitting = submitting[vote.id] ?? false

        return (
            <div className="bg-white border border-border rounded-xl shadow-card h-full flex flex-col">
                <div className="p-4 flex flex-col gap-3 h-full">

                    {/* 상태 뱃지 + 참여 수 */}
                    <div className="flex items-center justify-between">
                        {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-200 bg-green-50 text-xs font-semibold text-green-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                투표 진행중
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-muted text-xs font-semibold text-content-muted">
                                <span className="w-1.5 h-1.5 rounded-full bg-content-muted" />
                                투표 마감
                            </span>
                        )}
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-neutral-900">
                            <span className="font-bold text-primary">{totalCount.toLocaleString()}</span>명 참여 중
                        </span>
                    </div>

                    {/* 투표 제목 */}
                    <h3 className="text-sm font-bold text-content-primary line-clamp-2 leading-snug mt-1">
                        {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                    </h3>

                    {/* 결과지: 선택지 제목 바로 아래 */}
                    {showResults && (
                        <div className="flex flex-col gap-3">
                            {sortedByCount.map((choice, i) => {
                                const ratio = totalCount > 0 ? Math.round((choice.count / totalCount) * 100) : 0
                                const isMyChoice = choice.id === userChoiceId
                                return (
                                    <div key={choice.id}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                <span className="text-[10px] text-content-muted shrink-0 w-3">{i + 1}</span>
                                                <p className={`text-[13px] line-clamp-1 ${isMyChoice ? 'font-semibold text-primary' : 'text-content-secondary'}`}>
                                                    {choice.label}
                                                </p>
                                                {isMyChoice && (
                                                    <span className="text-[10px] text-primary shrink-0 font-bold">✓</span>
                                                )}
                                            </div>
                                            <span className={`text-xs font-bold ml-2 shrink-0 ${isMyChoice ? 'text-primary' : 'text-content-secondary'}`}>
                                                {ratio}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${isMyChoice ? 'bg-gradient-primary' : 'bg-border-strong'}`}
                                                style={{ width: `${ratio}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* 투표 전: 선택지+버튼 하단 고정 */}
                    {!showResults && (
                        <div className="mt-auto flex flex-col gap-1.5">
                            {choices.map((choice) => {
                                const isSelected = selectedChoiceId === choice.id
                                return (
                                    <button
                                        key={choice.id}
                                        onClick={() => setSelectedChoices(prev => ({ ...prev, [vote.id]: choice.id }))}
                                        className={`w-full text-left px-2.5 py-2.5 rounded-lg border transition-all ${
                                            isSelected
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                                isSelected ? 'bg-primary border-0' : 'border-2 border-border-strong'
                                            }`}>
                                                {isSelected && (
                                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                )}
                                            </span>
                                            <span className={`text-[13px] line-clamp-1 ${isSelected ? 'font-semibold text-primary' : 'text-content-primary'}`}>
                                                {choice.label}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {/* 푸터 액션 */}
                    <div className="mt-auto">
                        {showResults ? (
                            <Link
                                href={`/issue/${issueId}#section-vote`}
                                className="flex items-center justify-center w-full h-9 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                            >
                                자세히 보기
                            </Link>
                        ) : (
                            <button
                                onClick={() => selectedChoiceId && handleVote(vote.id, selectedChoiceId)}
                                disabled={!selectedChoiceId || isSubmitting}
                                className={`w-full h-9 rounded-lg text-xs font-bold transition-all ${
                                    selectedChoiceId
                                        ? 'bg-primary text-white hover:opacity-90 active:scale-[0.98]'
                                        : 'bg-surface-muted text-content-muted cursor-not-allowed'
                                }`}
                            >
                                {isSubmitting ? '투표 중...' : '투표하기'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <section className="pt-10 pb-6 md:pt-14 md:pb-8">
            <div className="container mx-auto">
                <div className="flex items-center gap-0.5 mb-1">
                    <h2 className="text-[17px] font-bold text-content-primary">지금 뜨는 투표</h2>
                    <Tooltip label="" align="left" width="w-max max-w-[300px]" text="진행 중인 투표 우선, 참여 수 많은 순으로 정렬됩니다." />
                </div>
                <Swiper
                    modules={[Pagination]}
                    spaceBetween={12}
                    slidesPerView={1}
                    loop={votes.length > 2}
                    pagination={{ clickable: true }}
                    breakpoints={{
                        640: { slidesPerView: 2 },
                        1024: { slidesPerView: 3 },
                        1280: { slidesPerView: 4 },
                        1536: { slidesPerView: 5, loop: false },
                    }}
                    className="vote-swiper"
                >
                    {votes.map(vote => (
                        <SwiperSlide key={vote.id} className="!h-auto pb-8">
                            {renderCard(vote)}
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
        </section>
    )
}
