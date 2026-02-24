/**
 * components/issues/PopularRanking.tsx
 *
 * [화력 TOP 랭킹 사이드 패널]
 *
 * 메인화면 오른쪽 사이드에 배치되는 랭킹 섹션입니다.
 * 현재 화력 상위 이슈 최대 6개를 순위 목록으로 보여줍니다.
 * 헤더에는 현재 월·주차 정보를 표시합니다.
 * 신규 이슈(24시간 이내)는 NEW 뱃지를 표시합니다.
 *
 * 예시:
 *   <PopularRanking />
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue, IssueCategory } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'

// 카테고리별 색상 블록
const CATEGORY_COLOR: Record<IssueCategory, string> = {
    '연예': 'bg-pink-400',
    '스포츠': 'bg-blue-400',
    '정치': 'bg-red-400',
    '사회': 'bg-emerald-400',
    '기술': 'bg-violet-400',
}

// 현재 월·주차 문자열 반환 (예: "2월 4주")
function getCurrentWeekLabel(): string {
    const now = new Date()
    const month = now.getMonth() + 1
    const weekOfMonth = Math.ceil(now.getDate() / 7)
    return `${month}월 ${weekOfMonth}주`
}

// 24시간 이내 신규 여부 확인
function isNew(dateString: string): boolean {
    const diffHours = (Date.now() - new Date(dateString).getTime()) / 3600000
    return diffHours < 24
}

// 날짜 포맷
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000)
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return '방금'
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

export default function PopularRanking() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                // 화력 상위 30개 조회 후 이번 주(7일 이내) 생성된 것만 TOP 6 추출
                // → 히어로(역대 화력 TOP)와 차별화되는 "이번 주 핫이슈" 목록
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

    const weekLabel = getCurrentWeekLabel()

    return (
        <section>
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-neutral-900">{weekLabel} 인기</h2>
                    {/* 막대 아이콘 (화력 게이지 상징) */}
                    <div className="flex items-end gap-0.5 h-4">
                        <div className="w-1 h-2 bg-violet-400 rounded-sm" />
                        <div className="w-1 h-3 bg-violet-500 rounded-sm" />
                        <div className="w-1 h-4 bg-violet-600 rounded-sm" />
                    </div>
                </div>
                <Link
                    href="/"
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                    전체
                </Link>
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
                        const colorClass = CATEGORY_COLOR[issue.category] ?? 'bg-neutral-300'
                        const newItem = isNew(issue.created_at)

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
                                            {/* NEW 뱃지 + 제목 */}
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                {newItem && (
                                                    <span className="shrink-0 text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-1 py-0.5 rounded leading-none">
                                                        NEW
                                                    </span>
                                                )}
                                                <p className="text-sm font-semibold text-neutral-800 line-clamp-1 group-hover:text-neutral-900">
                                                    {decodeHtml(issue.title)}
                                                </p>
                                            </div>

                                            {/* 카테고리 · 시간 · 인기 뱃지 */}
                                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                                                <span>{issue.category}</span>
                                                <span>·</span>
                                                <span>{formatDate(issue.created_at)}</span>
                                                {idx < 3 && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="text-violet-500 font-medium">인기</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* 카테고리 색상 블록 */}
                                        <div className={`shrink-0 w-10 h-10 rounded-lg ${colorClass} opacity-80`} />
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
