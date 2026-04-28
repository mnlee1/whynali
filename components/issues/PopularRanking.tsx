/**
 * components/issues/PopularRanking.tsx
 *
 * [지금 뜨는 이슈 / 급상승 중 랭킹 사이드 패널]
 *
 * 메인화면 오른쪽 사이드에 배치되는 랭킹 섹션입니다.
 * - 기본 모드: 화력 상위 이슈 (최근 7일)
 * - 급상승 모드: 1시간 기준 화력 증가율 상위 이슈
 *
 * initialIssues prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import { getCategoryById } from '@/lib/config/categories'
import Tooltip from '@/components/common/Tooltip'

interface IssueWithSurge extends Issue {
    surgePct?: number
}

interface Props {
    initialIssues?: IssueWithSurge[]
    isSurging?: boolean
}

function filterThisWeek(issues: Issue[]): Issue[] {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return issues
        .filter((i) => new Date(i.created_at).getTime() >= sevenDaysAgo)
        .slice(0, 5)
}

export default function PopularRanking({ initialIssues, isSurging = false }: Props) {
    const [issues, setIssues] = useState<IssueWithSurge[]>(
        initialIssues ? (isSurging ? initialIssues.slice(0, 5) : filterThisWeek(initialIssues)) : []
    )
    const [loading, setLoading] = useState(!initialIssues)
    const [activeIndex, setActiveIndex] = useState(0)
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (initialIssues) return
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 30 })
                setIssues(filterThisWeek(res.data))
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [initialIssues])

    useEffect(() => {
        if (issues.length === 0) return
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % issues.length)
        }, 2500)
        return () => clearInterval(interval)
    }, [issues.length])

    return (
        <section className="flex flex-col h-full">
            {/* 헤더 */}
            <div className="mb-4">
                <div className="flex items-center gap-0.5">
                    <h2 className="text-[17px] font-bold text-content-primary">
                        {isSurging ? '🔥 급상승 중' : '지금 뜨는 이슈'}
                    </h2>
                    <Tooltip
                        label=""
                        align="left"
                        width="w-max max-w-[300px]"
                        text={isSurging
                            ? "최근 1시간 기준 급상승 중인 이슈를 보여줍니다."
                            : "최근 7일 내 등록된 이슈를 화력(조회·반응·댓글) 기준으로 정렬합니다."
                        }
                    />
                </div>
            </div>

            {/* 랭킹 목록 */}
            {loading ? (
                <div className="flex flex-col flex-1 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex-1 bg-border-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <ol className="flex flex-col flex-1 gap-2">
                    {issues.map((issue, idx) => {
                        const isActive = activeIndex === idx
                        return (
                            <li 
                                key={issue.id} 
                                className="flex-1"
                            >
                                <Link href={`/issue/${issue.id}`} className="block h-full">
                                    <article className={`h-full bg-surface border rounded-xl transition-all duration-300 flex items-center gap-3.5 p-2.5 group ${
                                        isActive
                                            ? 'border-primary-muted shadow-card-hover -translate-y-0.5 bg-gradient-to-r from-primary-light/30 to-transparent'
                                            : 'border-border shadow-card hover:shadow-card-hover hover:border-primary-muted hover:-translate-y-0.5'
                                    }`}>
                                        {/* 순위 */}
                                        <span className={`shrink-0 text-sm font-bold w-5 text-center transition-all duration-300 ${
                                            isActive ? 'text-primary scale-110' : 'text-primary group-hover:scale-110'
                                        }`}>
                                            {idx + 1}
                                        </span>

                                        {/* 텍스트 */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold line-clamp-1 mb-1.5 transition-colors duration-300 ${
                                                isActive ? 'text-primary' : 'text-content-primary group-hover:text-primary'
                                            }`}>
                                                {decodeHtml(issue.title)}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-content-muted">
                                                {(() => {
                                                    const cat = getCategoryById(issue.category)
                                                    return cat ? <span>{cat.label}</span> : null
                                                })()}
                                                <span>·</span>
                                                <span>{formatDate(issue.created_at)}</span>
                                            </div>
                                        </div>

                                        {/* 썸네일 */}
                                        {(() => {
                                            const gradients = [
                                                'from-pink-400 via-purple-400 to-indigo-400',
                                                'from-blue-400 via-cyan-400 to-teal-400',
                                                'from-red-400 via-orange-400 to-amber-400',
                                                'from-emerald-400 via-teal-400 to-cyan-400',
                                                'from-violet-400 via-blue-400 to-cyan-400',
                                            ]
                                            const gradient = gradients[issues.indexOf(issue) % gradients.length]
                                            const thumbUrl = issue.thumbnail_urls?.[issue.primary_thumbnail_index ?? 0]
                                            const showImage = thumbUrl && !failedImages[issue.id]
                                            return showImage ? (
                                                <Image
                                                    src={thumbUrl}
                                                    alt=""
                                                    width={56}
                                                    height={56}
                                                    className="shrink-0 w-11 h-11 rounded-lg object-cover"
                                                    onError={() => setFailedImages(prev => ({ ...prev, [issue.id]: true }))}
                                                />
                                            ) : (
                                                <div className={`shrink-0 w-11 h-11 rounded-lg bg-gradient-to-br ${gradient}`} />
                                            )
                                        })()}
                                    </article>
                                </Link>
                            </li>
                        )
                    })}
                </ol>
            )}
        </section>
    )
}
