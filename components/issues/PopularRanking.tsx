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
        <section className="flex flex-col">
            {/* 헤더 */}
            <div className="mb-4">
                <h2 className="text-base font-bold text-neutral-900">지금 뜨는 이슈</h2>
            </div>

            {/* 랭킹 목록 */}
            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 bg-neutral-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <ol className="space-y-1">
                    {issues.map((issue, idx) => {
                        return (
                            <li key={issue.id}>
                                <Link href={`/issue/${issue.id}`} className="block">
                                    <article className="flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors group">
                                        {/* 순위 번호 */}
                                        <span className={`shrink-0 text-sm font-bold w-5 text-center ${
                                            idx === 0 ? 'text-violet-600' :
                                            idx === 1 ? 'text-neutral-600' :
                                            idx === 2 ? 'text-amber-600' :
                                            'text-neutral-400'
                                        }`}>
                                            {idx + 1}
                                        </span>

                                        {/* 텍스트 영역 */}
                                        <div className="flex-1 min-w-0">
                                            {/* 제목 */}
                                            <p className="text-sm font-semibold text-neutral-800 line-clamp-1 group-hover:text-neutral-900 mb-0.5">
                                                {decodeHtml(issue.title)}
                                            </p>

                                            {/* 카테고리 · 시간 */}
                                            <div className="flex items-center gap-2 text-xs text-neutral-400">
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
