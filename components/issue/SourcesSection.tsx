/**
 * components/issue/SourcesSection.tsx
 *
 * [이슈 출처 섹션]
 *
 * 이슈와 연결된 뉴스·커뮤니티 출처 목록을 보여주는 컴포넌트입니다.
 * 각 출처는 카드 형태로 표시되며, 신뢰도·날짜·링크 정보가 포함됩니다.
 * 데이터가 없거나 에러·로딩 중에는 null을 반환하여 영역 자체를 숨깁니다.
 *
 * 사용 예시:
 *   <SourcesSection issueId="abc-123" />
 */

'use client'

import { useState, useEffect } from 'react'
import { getSources } from '@/lib/api/issues'
import { formatDate } from '@/lib/utils/format-date'
import { getNewsSourceName } from '@/lib/utils/news-source-mapper'
import type { NewsData } from '@/types/issue'

const INITIAL_SHOW_COUNT = 5
const SHOW_STEP = 5

interface SourcesSectionProps {
    issueId: string
    initialNews?: NewsData[]
}

export default function SourcesSection({ issueId, initialNews }: SourcesSectionProps) {
    const [news, setNews] = useState<NewsData[]>(initialNews ?? [])
    const [loading, setLoading] = useState(!initialNews)
    const [error, setError] = useState<string | null>(null)
    const [showNewsCount, setShowNewsCount] = useState(INITIAL_SHOW_COUNT)

    useEffect(() => {
        if (initialNews) return
        const fetchSources = async () => {
            try {
                setLoading(true)
                const response = await getSources(issueId)
                setNews(response.news || [])
            } catch (err) {
                setError(err instanceof Error ? err.message : '출처 조회 실패')
            } finally {
                setLoading(false)
            }
        }

        fetchSources()
    }, [issueId, initialNews])

    const getCredibilityBadge = (credibility?: number) => {
        if (!credibility) return null
        if (credibility >= 0.8) {
            return <span className="badge bg-green-50 text-green-700 border-green-200">높음</span>
        }
        if (credibility >= 0.5) {
            return <span className="badge bg-yellow-50 text-yellow-700 border-yellow-200">중간</span>
        }
        return <span className="badge bg-surface-muted text-content-secondary border-border">낮음</span>
    }

    if (loading) return null
    if (error) return null

    const hasNews = news.length > 0

    if (!hasNews) return null

    const visibleNews = news.slice(0, showNewsCount)

    return (
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted">
                <h2 className="text-sm font-bold text-content-primary">출처</h2>
            </div>
            <div className="p-4">
                <div className="space-y-6">
                    {/* 뉴스 출처 */}
                    {hasNews && (
                        <div>
                            <h3 className="text-sm font-semibold text-content-primary mb-2">
                                뉴스
                                <span className="ml-1.5 text-xs font-normal text-content-muted">{news.length}건</span>
                            </h3>
                            <div className="space-y-2">
                                {visibleNews.map((item) => (
                                    <div key={item.id} className="border border-border rounded-xl bg-surface p-3">
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <a
                                                href={item.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-content-primary hover:text-primary underline underline-offset-2 flex-1 transition-colors"
                                            >
                                                {item.title}
                                            </a>
                                        </div>
                                        <div className="text-xs text-content-secondary">
                                            {getNewsSourceName(item.source)} · {formatDate(item.published_at)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {showNewsCount < news.length && (
                                <button
                                    onClick={() => setShowNewsCount((prev) => Math.min(prev + SHOW_STEP, news.length))}
                                    className="btn-neutral btn-md mt-3 w-full"
                                >
                                    {`${Math.min(SHOW_STEP, news.length - showNewsCount)}건 더 보기 (${news.length - showNewsCount}건 남음)`}
                                </button>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
