/**
 * components/issues/PopularRanking.tsx
 *
 * [지금 뜨는 이슈 랭킹 사이드 패널]
 *
 * 메인화면 오른쪽 사이드에 배치되는 랭킹 섹션입니다.
 * 현재 화력 상위 이슈 최대 6개를 순위 목록으로 보여줍니다.
 *
 * initialIssues prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import Tooltip from '@/components/common/Tooltip'

interface Props {
    initialIssues?: Issue[]
}

function filterThisWeek(issues: Issue[]): Issue[] {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return issues
        .filter((i) => new Date(i.created_at).getTime() >= sevenDaysAgo)
        .slice(0, 6)
}

export default function PopularRanking({ initialIssues }: Props) {
    const [issues, setIssues] = useState<Issue[]>(
        initialIssues ? filterThisWeek(initialIssues) : []
    )
    const [loading, setLoading] = useState(!initialIssues)
    const [activeIndex, setActiveIndex] = useState(0)

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
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-content-primary">지금 뜨는 이슈</h2>
                    <Tooltip label="화력순" text="최근 7일 내 등록된 이슈를 화력(조회·반응·댓글) 기준으로 정렬합니다." />
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
                                    <article className={`h-full bg-surface border rounded-xl transition-all duration-300 flex items-center gap-3 p-3 group ${
                                        isActive 
                                            ? 'border-primary-muted shadow-card-hover -translate-y-0.5 bg-gradient-to-r from-primary-light/30 to-transparent' 
                                            : 'border-border shadow-card hover:shadow-card-hover hover:border-primary-muted hover:-translate-y-0.5'
                                    }`}>
                                        <span className={`shrink-0 text-sm font-bold w-5 text-center transition-all duration-300 ${
                                            isActive ? 'text-primary scale-110' : 'text-primary group-hover:scale-110'
                                        }`}>
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold line-clamp-1 mb-0.5 transition-colors duration-300 ${
                                                isActive ? 'text-primary' : 'text-content-primary group-hover:text-primary'
                                            }`}>
                                                {decodeHtml(issue.title)}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-content-muted">
                                                <span>{issue.category}</span>
                                                <span>·</span>
                                                <span>{formatDate(issue.created_at)}</span>
                                            </div>
                                        </div>
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
