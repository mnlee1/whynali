/**
 * components/issues/ActiveIssueStrip.tsx
 *
 * [최근 진행 중 이슈 카드 그리드]
 *
 * 메인화면 히어로 캐러셀 아래 배치되는 섹션입니다.
 * 진행 중인 이슈 중 히어로에서 사용된 것을 제외한 최신 2개를 2열 카드로 보여줍니다.
 * 제목, 카테고리, 화력 지수, 업데이트 시간을 표시합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'

// 날짜 포맷
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000)
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return '방금 전'
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function ActiveIssueStrip() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                // 화력순 상위 10개 조회 후 TOP 5(히어로 사용 분)를 건너뛰고 진행 중인 것 2개 추출
                // → 히어로와 동일 이슈가 노출되지 않도록 6위 이후부터 선택
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const active = res.data
                    .filter((i) => i.status !== '종결')
                    .slice(5, 10)
                    .slice(0, 2)
                // 6위 이후 진행 중 이슈가 부족하면 최신순으로 보완
                if (active.length < 2) {
                    const fallback = await getIssues({ sort: 'latest', limit: 10 })
                    const fallbackActive = fallback.data
                        .filter((i) => i.status !== '종결')
                        .slice(0, 2)
                    setIssues(fallbackActive)
                } else {
                    setIssues(active)
                }
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
            <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                    <div key={i} className="h-32 bg-border-muted rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    if (issues.length === 0) return null

    return (
        <section>
            <div className="mb-3">
                <h2 className="text-sm font-bold text-content-secondary">최근 이슈</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {issues.map((issue) => (
                    <Link key={issue.id} href={`/issue/${issue.id}`}>
                        <article className="card-hover h-full p-4 transition-all">
                            {/* 카테고리 + 상태 */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-content-muted">{issue.category}</span>
                                <StatusBadge status={issue.status} size="sm" />
                            </div>

                            {/* 제목 */}
                            <p className="text-sm font-semibold text-content-primary line-clamp-2 leading-snug mb-3">
                                {decodeHtml(issue.title)}
                            </p>

                            {/* 화력 + 시간 */}
                            <div className="flex items-center justify-between text-xs text-content-muted">
                                <span>화력 {issue.heat_index ?? 0}</span>
                                <span>{formatDate(issue.created_at)}</span>
                            </div>
                        </article>
                    </Link>
                ))}
            </div>
        </section>
    )
}
