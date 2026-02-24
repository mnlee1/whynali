/**
 * components/issues/HotIssueHighlight.tsx
 *
 * [화력 TOP 이슈 하이라이트 섹션]
 *
 * 메인화면 최상단에 배치되는 섹션입니다.
 * 현재 진행 중인 이슈(점화/논란중) 중 화력 상위 2개를 크게 강조해서 보여줍니다.
 * "지금 왜 난리인가"를 첫 화면에서 바로 파악할 수 있도록 합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'

// 화력 게이지 단계 클래스 (인라인 스타일 없이 Tailwind 매핑)
function getHeatBarClass(heat: number): string {
    if (heat >= 80) return 'w-full'
    if (heat >= 60) return 'w-4/5'
    if (heat >= 40) return 'w-3/5'
    if (heat >= 20) return 'w-2/5'
    return 'w-1/5'
}

// 상태별 스타일 (카드 강조용)
function getStatusStyle(status: string): { accent: string; badge: string; icon: string } {
    switch (status) {
        case '점화':
            return {
                accent: 'border-red-300 bg-red-50',
                badge: 'bg-red-100 text-red-700 border-red-200',
                icon: '▲',
            }
        case '논란중':
            return {
                accent: 'border-orange-300 bg-orange-50',
                badge: 'bg-orange-100 text-orange-700 border-orange-200',
                icon: '●',
            }
        default:
            return {
                accent: 'border-neutral-200 bg-white',
                badge: 'bg-neutral-100 text-neutral-600 border-neutral-200',
                icon: '■',
            }
    }
}

// 날짜 포맷
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR')
}

export default function HotIssueHighlight() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                // 화력순으로 10개 가져온 후 진행 중인 것(점화/논란중) 상위 2개 추출
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const active = res.data.filter((i) => i.status !== '종결').slice(0, 2)
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                    <div key={i} className="h-36 bg-neutral-100 rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    if (issues.length === 0) return null

    return (
        <section>
            <div className="mb-3">
                <h2 className="text-base font-bold text-neutral-900">지금 가장 뜨거운 이슈</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {issues.map((issue, idx) => {
                    const style = getStatusStyle(issue.status)
                    const heat = issue.heat_index ?? 0
                    const barClass = getHeatBarClass(heat)

                    return (
                        <Link key={issue.id} href={`/issue/${issue.id}`}>
                            <article className={`relative p-5 border-2 rounded-xl hover:shadow-md transition-all ${style.accent}`}>
                                {/* 순위 뱃지 */}
                                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-500">
                                    {idx + 1}
                                </div>

                                {/* 카테고리 + 상태 */}
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs text-neutral-500">{issue.category}</span>
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-semibold ${style.badge}`}>
                                        <span className="text-[10px]">{style.icon}</span>
                                        {issue.status}
                                    </span>
                                </div>

                                {/* 제목 */}
                                <h3 className="text-base font-bold text-neutral-900 mb-4 line-clamp-2 pr-8">
                                    {issue.title}
                                </h3>

                                {/* 화력 게이지 */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-neutral-500 font-medium">화력 {heat}</span>
                                        <span className="text-neutral-400">{formatDate(issue.created_at)}</span>
                                    </div>
                                    <div className="h-2 bg-white bg-opacity-60 rounded-full overflow-hidden border border-neutral-200">
                                        <div className={`h-full rounded-full bg-red-500 ${barClass}`} />
                                    </div>
                                </div>
                            </article>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
