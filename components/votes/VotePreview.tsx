/**
 * components/votes/VotePreview.tsx
 *
 * [투표 미리보기 컴포넌트]
 *
 * 메인화면에서 현재 진행 중인 투표를 미리 보여줘 참여를 유도합니다.
 * 참여가 가장 활발한 투표 5개를 스와이프 형태로 보여줍니다.
 * 1위 vs 2위 대결 구도를 크게 강조하여 시각적 흥미를 높입니다.
 * 그라디언트 배경과 큰 "투표하기" 버튼으로 참여를 유도합니다.
 *
 * 투표가 하나도 없으면 섹션 전체를 숨깁니다.
 * 
 * Swiper 라이브러리를 사용하여 터치/마우스 스와이프를 지원합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import type { Issue } from '@/types/issue'
import type { Vote, VoteChoice } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'

// votes API 응답 형태 (vote_choices가 조인됨)
interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

export default function VotePreview() {
    const [votes, setVotes] = useState<VoteWithChoices[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                // 진행 중인 투표 목록 가져오기
                const res = await fetch('/api/votes?limit=50')
                if (!res.ok) return

                const json = await res.json()
                const allVotes: VoteWithChoices[] = json.data ?? []

                // 참여도 기준으로 정렬 (총 투표 수가 많은 순)
                const sortedVotes = allVotes
                    .map(vote => ({
                        ...vote,
                        totalVotes: (vote.vote_choices ?? []).reduce((sum, c) => sum + (c.count ?? 0), 0)
                    }))
                    .sort((a, b) => b.totalVotes - a.totalVotes)
                    .slice(0, 5)

                setVotes(sortedVotes)
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="h-64 bg-neutral-100 rounded-xl animate-pulse" />
        )
    }

    if (votes.length === 0) return null

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-neutral-900">지금 투표 중</h2>
                <span className="text-xs text-neutral-400">
                    투표 참여도 높은 순으로 정렬 됩니다.
                </span>
            </div>

            {/* Swiper를 사용한 슬라이드 영역 */}
            <Swiper
                modules={[Autoplay, Pagination]}
                spaceBetween={16}
                slidesPerView="auto"
                autoplay={{
                    delay: 5000,
                    disableOnInteraction: false,
                }}
                pagination={{
                    clickable: true,
                    bulletClass: 'swiper-pagination-bullet !bg-neutral-300',
                    bulletActiveClass: 'swiper-pagination-bullet-active !bg-violet-500',
                }}
                loop={votes.length > 1}
                className="!pb-10"
            >
                {votes.map((vote, index) => {
                    const choices = vote.vote_choices ?? []
                    const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
                    const issueId = vote.issues?.id ?? ''
                    if (!issueId) return null

                    // 득표순 정렬
                    const sortedChoices = [...choices].sort((a, b) => b.count - a.count)
                    const first = sortedChoices[0]
                    const second = sortedChoices[1]
                    const remaining = choices.length - 2

                    const firstRatio = totalCount > 0 ? Math.round((first.count / totalCount) * 100) : 0
                    const secondRatio = totalCount > 0 && second ? Math.round((second.count / totalCount) * 100) : 0

                    // 슬라이드마다 다른 그라디언트
                    const gradients = [
                        'from-violet-500 to-purple-600',
                        'from-blue-500 to-cyan-600',
                        'from-pink-500 to-rose-600',
                        'from-amber-500 to-orange-600',
                        'from-emerald-500 to-teal-600',
                    ]
                    const gradient = gradients[index % gradients.length]

                    return (
                        <SwiperSlide key={vote.id} className="!w-80 md:!w-96">
                            <Link href={`/issue/${issueId}`}>
                                <div className={`relative p-5 bg-gradient-to-br ${gradient} rounded-2xl hover:shadow-xl transition-all overflow-hidden group`}>
                                    {/* 배경 패턴 */}
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/5 transition-colors" />
                                    
                                    <div className="relative space-y-4">
                                        {/* 투표 제목 */}
                                        <h3 className="text-base font-bold text-white line-clamp-2 min-h-[3rem]">
                                            {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                                        </h3>

                                        {/* 1위 vs 2위 대결 */}
                                        <div className="space-y-3">
                                            {/* 1위 */}
                                            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-bold text-white/90">1위</span>
                                                    <span className="text-2xl font-black text-white">{firstRatio}%</span>
                                                </div>
                                                <p className="text-sm font-semibold text-white line-clamp-1">
                                                    {first.label}
                                                </p>
                                            </div>

                                            {/* 2위 (있을 경우) */}
                                            {second && (
                                                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-xs font-bold text-white/80">2위</span>
                                                        <span className="text-xl font-bold text-white/90">{secondRatio}%</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-white/90 line-clamp-1">
                                                        {second.label}
                                                    </p>
                                                </div>
                                            )}

                                            {/* 나머지 선택지 */}
                                            {remaining > 0 && (
                                                <p className="text-xs text-white/70 text-center">
                                                    외 {remaining}개 선택지
                                                </p>
                                            )}
                                        </div>

                                        {/* 하단 정보 */}
                                        <div className="flex items-center justify-between pt-3 border-t border-white/20">
                                            <span className="text-xs text-white/80 font-medium">
                                                {totalCount.toLocaleString()}명 참여
                                            </span>
                                            <div className="px-4 py-1.5 bg-white rounded-full">
                                                <span className="text-xs font-bold text-violet-600">
                                                    투표하기
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </SwiperSlide>
                    )
                })}
            </Swiper>
        </section>
    )
}

