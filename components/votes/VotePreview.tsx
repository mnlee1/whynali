/**
 * components/votes/VotePreview.tsx
 *
 * [투표 미리보기 컴포넌트]
 *
 * 메인화면에서 현재 진행 중인 투표를 미리 보여줘 참여를 유도합니다.
 * 참여가 가장 활발한 투표 5개를 스와이프 형태로 보여줍니다.
 * 1위 vs 2위 대결 구도를 크게 강조하여 시각적 흥미를 높입니다.
 *
 * initialVotes prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Autoplay } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import type { Vote, VoteChoice } from '@/types/index'
import Tooltip from '@/components/common/Tooltip'

interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

function sortVotes(votes: VoteWithChoices[]): VoteWithChoices[] {
    return votes
        .map(vote => ({
            ...vote,
            _total: (vote.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0),
        }))
        .sort((a, b) => b._total - a._total)
        .slice(0, 5)
}

interface Props {
    initialVotes?: VoteWithChoices[]
}

export default function VotePreview({ initialVotes }: Props) {
    const [votes, setVotes] = useState<VoteWithChoices[]>(
        initialVotes ? sortVotes(initialVotes) : []
    )
    const [loading, setLoading] = useState(!initialVotes)

    useEffect(() => {
        if (initialVotes) return
        async function load() {
            try {
                const res = await fetch('/api/votes?limit=50')
                if (!res.ok) return
                const json = await res.json()
                setVotes(sortVotes(json.data ?? []))
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [initialVotes])

    if (loading) {
        return (
            <div className="h-64 bg-neutral-100 rounded-xl animate-pulse" />
        )
    }

    if (votes.length === 0) return null

    const renderCard = (vote: VoteWithChoices, index: number) => {
        const choices = vote.vote_choices ?? []
        const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
        const issueId = vote.issues?.id ?? ''
        if (!issueId) return null

        const sortedChoices = [...choices].sort((a, b) => b.count - a.count)
        const first = sortedChoices[0]
        const second = sortedChoices[1]
        const remaining = choices.length - 2
        const firstRatio = totalCount > 0 ? Math.round((first.count / totalCount) * 100) : 0
        const secondRatio = totalCount > 0 && second ? Math.round((second.count / totalCount) * 100) : 0

        return (
            <Link href={`/issue/${issueId}`}>
                <div className="bg-white border border-border rounded-xl shadow-card hover:shadow-lg hover:border-border-strong transition-all duration-200 h-full flex flex-col group">
                    <div className="p-4 space-y-4 flex-1 flex flex-col">
                        <div className="space-y-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                투표 진행중
                            </span>
                            <h3 className="text-base font-bold text-content-primary line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                                {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                            </h3>
                        </div>

                        <div className="space-y-2 flex-1">
                            <div className="relative">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-xs font-semibold text-content-secondary shrink-0">1위</span>
                                        <p className="text-sm font-semibold text-content-primary line-clamp-1">{first.label}</p>
                                    </div>
                                    <span className="text-sm font-bold text-primary ml-2 shrink-0">{firstRatio}%</span>
                                </div>
                                <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-primary rounded-full transition-all duration-500" 
                                        style={{ width: `${firstRatio}%` }}
                                    />
                                </div>
                            </div>

                            {second && (
                                <div className="relative">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-content-muted shrink-0">2위</span>
                                            <p className="text-sm font-medium text-content-secondary line-clamp-1">{second.label}</p>
                                        </div>
                                        <span className="text-sm font-bold text-content-secondary ml-2 shrink-0">{secondRatio}%</span>
                                    </div>
                                    <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-border-strong rounded-full transition-all duration-500" 
                                            style={{ width: `${secondRatio}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            
                            {remaining > 0 && (
                                <p className="text-xs text-content-muted pt-1">외 {remaining}개</p>
                            )}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-border-muted">
                            <span className="text-xs text-content-muted font-medium">
                                {totalCount.toLocaleString()}명 참여
                            </span>
                            <span className="text-xs font-semibold text-primary group-hover:underline">
                                참여하기
                            </span>
                        </div>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <section className="py-6 md:py-8">
            <div className="container mx-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-content-primary">지금 투표 중</h2>
                    <Tooltip label="참여도순" text="투표 참여 수가 가장 많은 순으로 정렬됩니다." />
                </div>
            </div>

            <div className="container mx-auto">
                <Swiper
                    modules={[Pagination, Autoplay]}
                    spaceBetween={12}
                    slidesPerView={1}
                    loop={true}
                    autoplay={{
                        delay: 3000,
                        disableOnInteraction: false,
                    }}
                    pagination={{
                        clickable: true,
                        enabled: true,
                    }}
                    breakpoints={{
                        640: {
                            slidesPerView: 2,
                            spaceBetween: 12,
                        },
                        1024: {
                            slidesPerView: 3,
                            spaceBetween: 12,
                        },
                        1280: {
                            slidesPerView: 4,
                            spaceBetween: 12,
                        },
                        1536: {
                            slidesPerView: 5,
                            spaceBetween: 12,
                            loop: false,
                            autoplay: false,
                            pagination: {
                                enabled: false,
                            },
                        },
                    }}
                    className="vote-swiper"
                >
                    {votes.map((vote, index) => (
                        <SwiperSlide
                            key={vote.id}
                            className="!h-auto"
                        >
                            {renderCard(vote, index)}
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
        </section>
    )
}
