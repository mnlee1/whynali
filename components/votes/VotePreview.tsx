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
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import type { Vote, VoteChoice } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'
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

    const themes = [
        { bg: 'bg-violet-50', border: 'border-violet-200', bar: 'from-violet-400 to-purple-500', rankBg: 'bg-violet-100', rankText: 'text-violet-700', pctText: 'text-violet-600', btnBg: 'bg-violet-500', divider: 'border-violet-200', badgeBg: 'bg-violet-100 text-violet-700' },
        { bg: 'bg-sky-50', border: 'border-sky-200', bar: 'from-sky-400 to-blue-500', rankBg: 'bg-sky-100', rankText: 'text-sky-700', pctText: 'text-sky-600', btnBg: 'bg-sky-500', divider: 'border-sky-200', badgeBg: 'bg-sky-100 text-sky-700' },
        { bg: 'bg-rose-50', border: 'border-rose-200', bar: 'from-pink-400 to-rose-500', rankBg: 'bg-rose-100', rankText: 'text-rose-700', pctText: 'text-rose-600', btnBg: 'bg-rose-500', divider: 'border-rose-200', badgeBg: 'bg-rose-100 text-rose-700' },
        { bg: 'bg-amber-50', border: 'border-amber-200', bar: 'from-amber-400 to-orange-500', rankBg: 'bg-amber-100', rankText: 'text-amber-700', pctText: 'text-amber-600', btnBg: 'bg-amber-500', divider: 'border-amber-200', badgeBg: 'bg-amber-100 text-amber-700' },
        { bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'from-emerald-400 to-teal-500', rankBg: 'bg-emerald-100', rankText: 'text-emerald-700', pctText: 'text-emerald-600', btnBg: 'bg-emerald-500', divider: 'border-emerald-200', badgeBg: 'bg-emerald-100 text-emerald-700' },
    ]

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
        const theme = themes[index % themes.length]

        return (
            <Link href={`/issue/${issueId}`}>
                <div className={`relative ${theme.bg} border ${theme.border} rounded-2xl shadow-card hover:shadow-lg transition-all overflow-hidden group`}>
                    <div className={`h-1 bg-gradient-to-r ${theme.bar}`} />
                    <div className="p-5 space-y-4">
                        <div className="space-y-1 min-h-[3rem]">
                            <h3 className="text-base font-bold text-content-primary line-clamp-2">
                                {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                            </h3>
                            {vote.issues?.title && (
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${theme.badgeBg}`}>이슈</span>
                                    <span className="text-xs text-content-secondary truncate font-medium">
                                        {vote.issues.title}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <div className={`${theme.rankBg} rounded-xl p-3`}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-xs font-bold ${theme.rankText}`}>1위</span>
                                    <span className={`text-2xl font-black ${theme.pctText}`}>{firstRatio}%</span>
                                </div>
                                <p className="text-sm font-semibold text-content-primary line-clamp-1">{first.label}</p>
                            </div>
                            {second && (
                                <div className="bg-white/70 border border-border rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-content-muted">2위</span>
                                        <span className="text-xl font-bold text-content-secondary">{secondRatio}%</span>
                                    </div>
                                    <p className="text-sm font-medium text-content-secondary line-clamp-1">{second.label}</p>
                                </div>
                            )}
                            {remaining > 0 && (
                                <p className="text-xs text-content-muted text-center">외 {remaining}개 선택지</p>
                            )}
                        </div>
                        <div className={`flex items-center justify-between pt-3 border-t ${theme.divider}`}>
                            <span className="text-xs text-content-secondary font-medium">
                                {totalCount.toLocaleString()}명 참여
                            </span>
                            <div className={`px-4 py-1.5 ${theme.btnBg} rounded-full`}>
                                <span className="text-xs font-bold text-white">투표하기</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-content-primary">지금 투표 중</h2>
                <Tooltip label="참여도순" text="투표 참여 수가 가장 많은 순으로 정렬됩니다." />
            </div>

            <div className="py-2 -my-2">
            <Swiper
                modules={[Autoplay, Pagination]}
                spaceBetween={12}
                slidesPerView="auto"
                autoplay={votes.length > 1 ? { delay: 5000, disableOnInteraction: false } : false}
                pagination={votes.length > 1 ? {
                    clickable: true,
                    bulletClass: 'swiper-pagination-bullet !bg-neutral-300',
                    bulletActiveClass: 'swiper-pagination-bullet-active !bg-violet-500',
                } : false}
                loop={votes.length > 2}
                className={votes.length > 1 ? '!overflow-visible !pb-10 !-mr-4 md:!mr-0' : '!overflow-visible'}
            >
                {votes.map((vote, index) => (
                    <SwiperSlide
                        key={vote.id}
                        className={
                            votes.length === 1
                                ? '!w-full md:!w-96'
                                : '!w-[85%] md:!w-96'
                        }
                    >
                        {renderCard(vote, index)}
                    </SwiperSlide>
                ))}
            </Swiper>
            </div>
        </section>
    )
}
