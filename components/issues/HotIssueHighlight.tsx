/**
 * components/issues/HotIssueHighlight.tsx
 *
 * [왜난리 이슈 히어로 캐러셀]
 *
 * 메인화면 최상단에 배치되는 히어로 섹션입니다.
 * 화력 상위 이슈 최대 5개를 Swiper 캐러셀로 보여줍니다.
 * 카테고리별 그라디언트 배경으로 이미지 없이도 시각적으로 강조합니다.
 * 간결한 정보 제공으로 가독성을 높입니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import { getIssues } from '@/lib/api/issues'
import StatusBadge from '@/components/common/StatusBadge'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'

import 'swiper/css'
import 'swiper/css/pagination'

interface IssueStats {
    viewCount: number
    commentCount: number
    voteCount: number
    discussionCount: number
}

interface IssueWithStats extends Issue {
    stats?: IssueStats
}

export default function HotIssueHighlight() {
    const [issues, setIssues] = useState<IssueWithStats[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const active = res.data.filter((i) => i.status !== '종결').slice(0, 5)
                
                // 각 이슈의 통계 데이터 가져오기
                const issuesWithStats = await Promise.all(
                    active.map(async (issue) => {
                        try {
                            const statsRes = await fetch(`/api/issues/${issue.id}/stats`)
                            if (statsRes.ok) {
                                const stats = await statsRes.json()
                                return { ...issue, stats }
                            }
                        } catch {
                            // 통계 로드 실패 시 이슈만 반환
                        }
                        return issue
                    })
                )
                
                setIssues(issuesWithStats)
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
            <div className="h-[300px] lg:h-full bg-neutral-100 rounded-2xl animate-pulse" />
        )
    }

    if (issues.length === 0) return null

    return (
        <section className="relative h-[300px] lg:h-full">
            {/* 왜난리 이슈 뱃지 */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    왜난리 이슈
                </span>
                <span className="px-2 py-1 rounded-full bg-black/20 backdrop-blur-sm text-white text-xs font-medium">
                    실시간 화력 상위 5개
                </span>
            </div>

            <Swiper
                modules={[Autoplay, Pagination]}
                spaceBetween={0}
                slidesPerView={1}
                autoplay={{ delay: 5000, disableOnInteraction: false }}
                pagination={{ clickable: true }}
                loop={issues.length > 1}
                className="h-full rounded-2xl"
            >
            {issues.map((issue, index) => {
                // 슬라이드 순서에 따른 고유 배경 그라디언트 (5가지 색상)
                const gradients = [
                    'from-pink-500 via-purple-500 to-indigo-500',      // 슬라이드 1: 핑크-퍼플-인디고
                    'from-blue-500 via-cyan-500 to-teal-500',          // 슬라이드 2: 블루-시안-틸
                    'from-red-500 via-orange-500 to-amber-500',        // 슬라이드 3: 레드-오렌지-앰버
                    'from-emerald-500 via-teal-500 to-cyan-500',       // 슬라이드 4: 에메랄드-틸-시안
                    'from-violet-500 via-blue-500 to-cyan-500',        // 슬라이드 5: 바이올렛-블루-시안
                ]
                const gradient = gradients[index % gradients.length]

                return (
                    <SwiperSlide key={issue.id}>
                        <Link href={`/issue/${issue.id}`}>
                            <article className={`relative h-full bg-gradient-to-br ${gradient} cursor-pointer group`}>
                                {/* 오버레이 */}
                                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

                                {/* 콘텐츠 */}
                                <div className="absolute inset-0 flex flex-col justify-between p-5 lg:p-6 pb-14">
                                    {/* 빈 공간 (왜난리 이슈 뱃지를 위한 여백) */}
                                    <div />

                                    {/* 하단: 이슈 정보 */}
                                    <div className="space-y-3">
                                        {/* 상태 배지 */}
                                        <div>
                                            <StatusBadge status={issue.status} size="sm" />
                                        </div>

                                        {/* 제목 */}
                                        <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight line-clamp-2">
                                            {decodeHtml(issue.title)}
                                        </h2>

                                        {/* 카테고리 · 생성일 */}
                                        <div className="flex items-center gap-2 text-sm text-white/80 font-medium">
                                            <span>{issue.category}</span>
                                            <span>·</span>
                                            <span>{formatDate(issue.created_at)}</span>
                                        </div>

                                        {/* 통계 정보 */}
                                        {issue.stats && (
                                            <div className="flex items-center gap-4 text-sm text-white/75">
                                                <span className="flex items-center gap-1.5">
                                                    <span>👁️</span>
                                                    <span>{issue.stats.viewCount.toLocaleString()}</span>
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <span>💬</span>
                                                    <span>{issue.stats.commentCount.toLocaleString()}</span>
                                                </span>
                                                {issue.stats.voteCount > 0 && (
                                                    <span className="flex items-center gap-1.5">
                                                        <span>🗳️</span>
                                                        <span>{issue.stats.voteCount}</span>
                                                    </span>
                                                )}
                                                {issue.stats.discussionCount > 0 && (
                                                    <span className="flex items-center gap-1.5">
                                                        <span>💭</span>
                                                        <span>{issue.stats.discussionCount}</span>
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </article>
                        </Link>
                    </SwiperSlide>
                )
            })}
            </Swiper>
        </section>
    )
}
