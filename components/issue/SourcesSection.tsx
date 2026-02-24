/**
 * components/issue/SourcesSection.tsx
 * 
 * [이슈 출처 섹션]
 * 
 * 이슈와 연결된 뉴스·커뮤니티 출처 목록을 보여주는 컴포넌트입니다.
 * 각 출처는 카드 형태로 표시되며, 신뢰도·날짜·링크 정보가 포함됩니다.
 * 
 * 사용 예시:
 *   <SourcesSection issueId="abc-123" />
 */

'use client'

import { useState, useEffect } from 'react'
import { getSources } from '@/lib/api/issues'
import type { NewsData, CommunityData } from '@/types/issue'

const INITIAL_SHOW_COUNT = 5 // 처음에 보여줄 항목 수

// 커뮤니티 사이트별 배지 색상 매핑
const SITE_BADGE_CLASS: Record<string, string> = {
    '더쿠': 'bg-pink-50 text-pink-700 border-pink-200',
    '네이트판': 'bg-orange-50 text-orange-700 border-orange-200',
}

interface SourcesSectionProps {
    issueId: string // 출처를 가져올 이슈 ID
}

export default function SourcesSection({ issueId }: SourcesSectionProps) {
    const [news, setNews] = useState<NewsData[]>([])
    const [community, setCommunity] = useState<CommunityData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showAllNews, setShowAllNews] = useState(false)
    const [showAllCommunity, setShowAllCommunity] = useState(false)

    useEffect(() => {
        const fetchSources = async () => {
            try {
                setLoading(true)
                const response = await getSources(issueId)
                setNews(response.news || [])
                setCommunity(response.community || [])
            } catch (err) {
                setError(err instanceof Error ? err.message : '출처 조회 실패')
            } finally {
                setLoading(false)
            }
        }

        fetchSources()
    }, [issueId])

    // 날짜 포맷
    const formatDate = (dateString: string): string => {
        const date = new Date(dateString)
        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
        })
    }

    // 신뢰도 배지 (뉴스 전용, 커뮤니티는 해당 없음)
    const getCredibilityBadge = (credibility?: number) => {
        if (!credibility) return null
        if (credibility >= 0.8) {
            return <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium">높음</span>
        }
        if (credibility >= 0.5) {
            return <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 font-medium">중간</span>
        }
        return <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-600 rounded border border-gray-200 font-medium">낮음</span>
    }

    if (loading) {
        return (
            <div className="py-4 text-center text-gray-500">
                출처 로딩 중...
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                {error}
            </div>
        )
    }

    const hasNews = news.length > 0
    const hasCommunity = community.length > 0

    if (!hasNews && !hasCommunity) {
        return (
            <div className="py-4 text-center text-gray-500">
                등록된 출처가 없습니다.
            </div>
        )
    }

    const visibleNews = showAllNews ? news : news.slice(0, INITIAL_SHOW_COUNT)
    const visibleCommunity = showAllCommunity ? community : community.slice(0, INITIAL_SHOW_COUNT)

    return (
        <div className="space-y-6">
            {/* 뉴스 출처 */}
            {hasNews && (
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        뉴스
                        <span className="ml-2 text-sm font-normal text-gray-400">{news.length}건</span>
                    </h3>
                    <div className="space-y-3">
                        {visibleNews.map((item) => (
                            <div key={item.id} className="p-4 border border-gray-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-medium hover:text-neutral-600 underline flex-1"
                                    >
                                        {item.title}
                                    </a>
                                </div>
                                <div className="text-xs text-gray-500">
                                    {item.source} · {formatDate(item.published_at)}
                                </div>
                            </div>
                        ))}
                    </div>
                    {news.length > INITIAL_SHOW_COUNT && (
                        <button
                            onClick={() => setShowAllNews((prev) => !prev)}
                            className="mt-3 w-full py-2 text-sm text-neutral-600 border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
                        >
                            {showAllNews
                                ? '접기'
                                : `${news.length - INITIAL_SHOW_COUNT}건 더 보기`}
                        </button>
                    )}
                </div>
            )}

            {/* 커뮤니티 출처 */}
            {hasCommunity && (
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        커뮤니티
                        <span className="ml-2 text-sm font-normal text-gray-400">{community.length}건</span>
                    </h3>
                    <div className="space-y-3">
                        {visibleCommunity.map((item) => (
                            <div key={item.id} className="p-4 border border-gray-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-medium hover:text-neutral-600 underline flex-1"
                                    >
                                        {item.title}
                                    </a>
                                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SITE_BADGE_CLASS[item.source_site] ?? 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                        {item.source_site}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-3">
                                    <span>{formatDate(item.written_at)}</span>
                                    {item.view_count > 0 && (
                                        <span>조회 {item.view_count.toLocaleString()}</span>
                                    )}
                                    {item.comment_count > 0 && (
                                        <span>댓글 {item.comment_count.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {community.length > INITIAL_SHOW_COUNT && (
                        <button
                            onClick={() => setShowAllCommunity((prev) => !prev)}
                            className="mt-3 w-full py-2 text-sm text-neutral-600 border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
                        >
                            {showAllCommunity
                                ? '접기'
                                : `${community.length - INITIAL_SHOW_COUNT}건 더 보기`}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
