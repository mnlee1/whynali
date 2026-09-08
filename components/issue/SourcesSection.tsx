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
import Drawer from '@/components/common/Drawer'
import type { NewsData } from '@/types/issue'

const INITIAL_SHOW_COUNT = 2
const SCROLL_MAX_HEIGHT = 'max-h-[420px]'

interface SourcesSectionProps {
    issueId: string
    initialNews?: NewsData[]
    /** true면 "더보기" 클릭 시 전체 목록을 한 번에 표시 (기본: 5건씩 단계적 표시) */
    expandFully?: boolean
}

export default function SourcesSection({ issueId, initialNews, expandFully = false }: SourcesSectionProps) {
    const [news, setNews] = useState<NewsData[]>(initialNews ?? [])
    const [loading, setLoading] = useState(!initialNews)
    const [error, setError] = useState<string | null>(null)
    const [showNewsCount, setShowNewsCount] = useState(INITIAL_SHOW_COUNT)
    const [drawerOpen, setDrawerOpen] = useState(false)

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

    const NewsCard = ({ item }: { item: NewsData }) => (
        <div className="border border-border rounded-xl bg-surface p-3">
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
    )

    // 관리자 미리보기(expandFully)는 기존처럼 목록을 그 자리에서 단계적으로 펼침
    if (expandFully) {
        const visibleNews = news.slice(0, showNewsCount)
        return (
            <div className="card overflow-hidden mb-6">
                <div className="px-4 py-3 border-b border-border-muted flex items-end gap-2">
                    <h2 className="text-sm font-bold text-content-primary">출처 뉴스</h2>
                    <span className="text-xs font-normal text-content-muted">{news.length}건</span>
                </div>
                <div className="p-4">
                    <div className={`space-y-2 ${showNewsCount > INITIAL_SHOW_COUNT ? `${SCROLL_MAX_HEIGHT} overflow-y-auto thin-scrollbar pr-1` : ''}`}>
                        {visibleNews.map((item) => <NewsCard key={item.id} item={item} />)}
                    </div>
                    <div className="flex gap-2 mt-3">
                        {showNewsCount < news.length && (
                            <button
                                onClick={() => setShowNewsCount(news.length)}
                                className="btn-neutral btn-md flex-1"
                            >
                                {`더보기 (전체 ${news.length}건)`}
                            </button>
                        )}
                        {showNewsCount > INITIAL_SHOW_COUNT && (
                            <button
                                onClick={() => setShowNewsCount(INITIAL_SHOW_COUNT)}
                                className="btn-neutral btn-md flex-1"
                            >
                                접기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // 일반 유저: 카드 형태 대신 짧은 텍스트 링크로만 노출 — 상단 메타 정보 줄에 끼워 넣어
    // 출처 뉴스 자체가 별도 스크롤 영역을 차지하지 않고, 투표·토론 등 참여 콘텐츠를 더 빨리 보여줌
    return (
        <>
            <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="ml-auto shrink-0 text-xs text-content-muted hover:text-content-primary transition-colors"
            >
                출처뉴스 {news.length}건 →
            </button>

            <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={`출처 뉴스 ${news.length}건`}>
                <div className="p-4 space-y-2">
                    {news.map((item) => <NewsCard key={item.id} item={item} />)}
                </div>
            </Drawer>
        </>
    )
}
