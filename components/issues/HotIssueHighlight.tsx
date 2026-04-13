/**
 * components/issues/HotIssueHighlight.tsx
 *
 * [왜난리 이슈 히어로 캐러셀]
 *
 * 메인화면 최상단에 배치되는 히어로 섹션입니다.
 * 화력 상위 이슈 최대 5개를 Swiper 캐러셀로 보여줍니다.
 * 카테고리별 그라디언트 배경으로 이미지 없이도 시각적으로 강조합니다.
 *
 * initialIssues prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
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

interface Props {
    initialIssues?: Issue[]
}

export default function HotIssueHighlight({ initialIssues }: Props) {
    const [issues, setIssues] = useState<Issue[]>(initialIssues ?? [])
    const [loading, setLoading] = useState(!initialIssues)

    useEffect(() => {
        if (initialIssues) return
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 10 })
                setIssues(res.data.filter((i) => i.status !== '종결').slice(0, 5))
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [initialIssues])

    if (loading) {
        return (
            <div className="h-[420px] lg:h-full lg:min-h-[500px] bg-border-muted rounded-2xl animate-pulse" />
        )
    }

    if (issues.length === 0) {
        return (
            <section className="relative h-[420px] lg:h-full lg:min-h-[500px] bg-border-muted rounded-2xl flex items-center justify-center">
                <p className="text-content-muted text-sm">이슈를 불러오는 중입니다.</p>
            </section>
        )
    }

    return (
        <section className="relative h-[420px] lg:h-full lg:min-h-[500px]">
            {/* 왜난리 이슈 뱃지 */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-primary text-white text-xs font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    왜난리 이슈
                </span>
                <span className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold shadow-sm">
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
                className="h-full rounded-2xl transition-shadow duration-300 hover:shadow-2xl"
            >
            {issues.map((issue, index) => {
                const gradients = [
                    'from-pink-500 via-purple-500 to-indigo-500',
                    'from-blue-500 via-cyan-500 to-teal-500',
                    'from-red-500 via-orange-500 to-amber-500',
                    'from-emerald-500 via-teal-500 to-cyan-500',
                    'from-violet-500 via-blue-500 to-cyan-500',
                ]
                const gradient = gradients[index % gradients.length]

                const heroImage = issue.thumbnail_urls?.[issue.primary_thumbnail_index ?? 0] ?? null

                return (
                    <SwiperSlide key={issue.id}>
                        <Link href={`/issue/${issue.id}`}>
                            <article className={`relative h-full ${heroImage ? '' : `bg-gradient-to-br ${gradient}`} cursor-pointer group ring-2 ring-transparent group-hover:ring-primary-muted/70 transition-all overflow-hidden`}>
                                {/* Unsplash 이미지 배경 (있을 때만) */}
                                {heroImage && (
                                    <img
                                        src={heroImage}
                                        alt=""
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                )}

                                {/* 그라디언트 배경일 때만: 애니메이션 블롭 */}
                                {!heroImage && (
                                    <div className="absolute inset-0 opacity-40">
                                        <div className={`absolute top-0 right-0 w-96 h-96 bg-white/20 rounded-full blur-3xl animate-blob`} />
                                        <div className={`absolute bottom-0 left-0 w-80 h-80 bg-white/15 rounded-full blur-3xl animate-blob animation-delay-2000`} />
                                        <div className={`absolute top-1/2 left-1/2 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-blob animation-delay-4000`} />
                                    </div>
                                )}

                                {/* 노이즈 텍스처 오버레이 */}
                                <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay" />

                                {/* 그리드 패턴 */}
                                {!heroImage && (
                                    <div className="absolute inset-0 opacity-10" style={{
                                        backgroundImage: `
                                            linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent),
                                            linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent)
                                        `,
                                        backgroundSize: '50px 50px'
                                    }} />
                                )}

                                {/* 다크 오버레이 (이미지 위 텍스트 가독성) */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent group-hover:from-black/60 group-hover:via-black/20 transition-all duration-500" />

                                {/* 콘텐츠 */}
                                <div className="absolute inset-0 flex flex-col justify-between p-5 lg:p-6 pb-14">
                                    <div />

                                    {/* 하단: 이슈 정보 */}
                                    <div className="space-y-3">
                                        <div>
                                            <StatusBadge status={issue.status} size="sm" />
                                        </div>

                                        <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">
                                            {decodeHtml(issue.title)}
                                        </h2>

                                        <div className="flex items-center gap-2 text-sm text-white/90 font-medium drop-shadow-md">
                                            <span>{issue.category}</span>
                                            <span>·</span>
                                            <span>{formatDate(issue.created_at)}</span>
                                        </div>
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
