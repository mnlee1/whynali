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

interface SourcesSectionProps {
    issueId: string // 출처를 가져올 이슈 ID
}

export default function SourcesSection({ issueId }: SourcesSectionProps) {
    const [news, setNews] = useState<NewsData[]>([])
    const [community, setCommunity] = useState<CommunityData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
            return <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">높음</span>
        }
        if (credibility >= 0.5) {
            return <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">중간</span>
        }
        return <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">낮음</span>
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

    return (
        <div className="space-y-6">
            {/* 뉴스 출처 */}
            {hasNews && (
                <div>
                    <h3 className="text-lg font-semibold mb-3">뉴스</h3>
                    <div className="space-y-3">
                        {news.map((item) => (
                            <div key={item.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-medium hover:text-blue-600 underline flex-1"
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
                </div>
            )}

            {/* 커뮤니티 출처 */}
            {hasCommunity && (
                <div>
                    <h3 className="text-lg font-semibold mb-3">커뮤니티</h3>
                    <div className="space-y-3">
                        {community.map((item) => (
                            <div key={item.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-base font-medium hover:text-blue-600 underline flex-1"
                                    >
                                        {item.title}
                                    </a>
                                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
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
                </div>
            )}
        </div>
    )
}
