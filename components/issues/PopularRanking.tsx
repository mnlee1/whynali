/**
 * components/issues/PopularRanking.tsx
 *
 * [지금 뜨는 이슈 랭킹 사이드 패널]
 *
 * 메인화면 오른쪽 사이드에 배치되는 랭킹 섹션입니다.
 * 현재 화력 상위 이슈 최대 6개를 순위 목록으로 보여줍니다.
 *
 * 예시:
 *   <PopularRanking />
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import Tooltip from '@/components/common/Tooltip'

export default function PopularRanking() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 30 })
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
                const thisWeek = res.data
                    .filter((i) => new Date(i.created_at).getTime() >= sevenDaysAgo)
                    .slice(0, 6)
                setIssues(thisWeek)
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

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
                    {issues.map((issue, idx) => (
                        <li key={issue.id} className="flex-1">
                            <Link href={`/issue/${issue.id}`} className="block h-full">
                                <article className="h-full bg-surface border border-border shadow-card rounded-xl hover:shadow-card-hover transition-shadow flex items-center gap-3 p-3 group">
                                    {/* 순위 번호 */}
                                    <span className="shrink-0 text-sm font-bold w-5 text-center text-primary">
                                        {idx + 1}
                                    </span>

                                    {/* 텍스트 영역 */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-content-primary line-clamp-1 group-hover:text-primary mb-0.5 transition-colors">
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
                    ))}
                </ol>
            )}
        </section>
    )
}
