/**
 * components/votes/VotePreview.tsx
 *
 * [투표 미리보기 컴포넌트]
 *
 * 메인화면에서 현재 진행 중인 투표를 미리 보여줘 참여를 유도합니다.
 * 참여가 가장 활발한 투표 5개를 스와이프 형태로 보여줍니다.
 * 선택지와 현재 득표 비율을 바 형태로 보여주고, 클릭하면 해당 이슈 상세로 이동합니다.
 *
 * 투표가 하나도 없으면 섹션 전체를 숨깁니다.
 * 
 * Swiper 라이브러리를 사용하여 터치/마우스 스와이프를 지원합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode, Mousewheel } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/free-mode'
import type { Issue } from '@/types/issue'
import type { Vote, VoteChoice } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'

// votes API 응답 형태 (vote_choices가 조인됨)
interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
    issues?: { id: string; title: string } | null
}

// 득표 비율을 Tailwind 단계 클래스로 변환 (인라인 스타일 없이 표현)
function getRatioBarClass(ratio: number): string {
    if (ratio >= 90) return 'w-11/12'
    if (ratio >= 75) return 'w-3/4'
    if (ratio >= 60) return 'w-3/5'
    if (ratio >= 50) return 'w-1/2'
    if (ratio >= 40) return 'w-2/5'
    if (ratio >= 25) return 'w-1/4'
    if (ratio >= 10) return 'w-1/12'
    return 'w-1'
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
                    {votes.length}개 투표 진행 중
                </span>
            </div>

            {/* Swiper를 사용한 스와이프 영역 */}
            <Swiper
                modules={[FreeMode, Mousewheel]}
                spaceBetween={16}
                slidesPerView="auto"
                freeMode={{
                    enabled: true,
                    sticky: false,
                }}
                mousewheel={{
                    forceToAxis: true,
                }}
                className="!overflow-visible"
            >
                {votes.map((vote) => {
                    const choices = vote.vote_choices ?? []
                    const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)
                    const issueTitle = vote.issues?.title ?? '알 수 없는 이슈'
                    const issueId = vote.issues?.id ?? ''

                    return (
                        <SwiperSlide key={vote.id} className="!w-80">
                            <Link href={`/issue/${issueId}`}>
                                <div className="p-4 bg-white border border-violet-200 rounded-xl hover:border-violet-300 hover:shadow-md transition-all h-full">
                                    {/* 연결된 이슈 제목 */}
                                    <p className="text-xs text-violet-600 font-medium mb-1 line-clamp-1">
                                        {decodeHtml(issueTitle)}
                                    </p>

                                    {/* 투표 제목 */}
                                    <p className="text-sm font-bold text-neutral-900 mb-4 line-clamp-2 min-h-[2.5rem]">
                                        {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                                    </p>

                                    {/* 선택지 + 득표 바 */}
                                    <div className="space-y-2.5">
                                        {choices.slice(0, 4).map((choice) => {
                                            const ratio = totalCount > 0
                                                ? Math.round((choice.count / totalCount) * 100)
                                                : 0
                                            const barClass = getRatioBarClass(ratio)

                                            // 득표 1위 여부
                                            const maxCount = Math.max(...choices.map((c) => c.count))
                                            const isLeading = choice.count === maxCount && totalCount > 0

                                            return (
                                                <div key={choice.id}>
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className={`font-medium truncate ${isLeading ? 'text-violet-700' : 'text-neutral-600'}`}>
                                                            {choice.label}
                                                        </span>
                                                        <span className={`ml-2 ${isLeading ? 'text-violet-600 font-semibold' : 'text-neutral-400'}`}>
                                                            {ratio}%
                                                        </span>
                                                    </div>
                                                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${barClass} ${isLeading ? 'bg-violet-500' : 'bg-neutral-300'}`} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* 총 투표 수 + 참여 유도 */}
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
                                        <span className="text-xs text-neutral-400">
                                            총 {totalCount.toLocaleString()}명 참여
                                        </span>
                                        <span className="text-xs text-violet-600 font-medium">
                                            투표 참여 →
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        </SwiperSlide>
                    )
                })}
            </Swiper>

            {/* 스크롤 힌트 */}
            {votes.length > 1 && (
                <p className="text-xs text-center text-neutral-400 mt-4">
                    ← 좌우로 스와이프하여 더 많은 투표 보기 →
                </p>
            )}
        </section>
    )
}

