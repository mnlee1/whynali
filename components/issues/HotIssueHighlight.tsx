/**
 * components/issues/HotIssueHighlight.tsx
 *
 * [왜난리 이슈 히어로 캐러셀]
 *
 * 메인화면 최상단에 배치되는 히어로 섹션입니다.
 * 화력 상위 이슈 최대 5개를 Swiper 캐러셀로 보여줍니다.
 * 카테고리별 그라디언트 배경으로 이미지 없이도 시각적으로 강조합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import { getIssues } from '@/lib/api/issues'
import StatusBadge from '@/components/common/StatusBadge'
import type { Issue, IssueCategory } from '@/types/issue'
import { getCategoryById } from '@/lib/config/categories'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'

import 'swiper/css'
import 'swiper/css/pagination'

export default function HotIssueHighlight() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const active = res.data.filter((i) => i.status !== '종결').slice(0, 5)
                setIssues(active)
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
            <div className="h-[280px] lg:h-[432px] bg-neutral-100 rounded-2xl animate-pulse" />
        )
    }

    if (issues.length === 0) return null

    return (
        <section className="relative h-[280px] lg:h-[432px]">
            {/* 왜난리 이슈 뱃지 */}
            <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    왜난리 이슈
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
            {issues.map((issue) => {
                const config = getCategoryById(issue.category)
                const gradient = config?.gradientColors ?? 'from-neutral-600 to-neutral-800'

                return (
                    <SwiperSlide key={issue.id}>
                        <Link href={`/issue/${issue.id}`}>
                            <article className={`relative h-full bg-gradient-to-br ${gradient} cursor-pointer group`}>
                                    {/* 오버레이 */}
                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

                                    {/* 콘텐츠 */}
                                    <div className="absolute inset-0 flex flex-col justify-end p-5 pb-14">
                                        {/* 상태 배지 */}
                                        <div className="mb-2">
                                            <StatusBadge status={issue.status} size="sm" />
                                        </div>

                                        {/* 제목 */}
                                        <h2 className="text-xl font-bold text-white leading-snug line-clamp-2 mb-2">
                                            {decodeHtml(issue.title)}
                                        </h2>

                                        {/* 카테고리 · 날짜 */}
                                        <div className="flex items-center gap-2 text-xs text-white/70 font-medium">
                                            <span>{issue.category}</span>
                                            <span>·</span>
                                            <span>{formatDate(issue.created_at)}</span>
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
