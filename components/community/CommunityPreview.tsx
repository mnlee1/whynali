/**
 * components/community/CommunityPreview.tsx
 *
 * [커뮤니티 최신 토론 주제 미리보기]
 *
 * 메인화면 하단에 배치되는 섹션입니다.
 * 진행중인 토론 주제를 최대 5개 표시합니다.
 * 토론 주제가 없거나 로드 실패 시 섹션 전체를 숨깁니다.
 *
 * 사용 예시:
 *   <CommunityPreview />
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { DiscussionTopic } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import Tooltip from '@/components/common/Tooltip'

// 토론 주제에 연결된 이슈 정보와 의견 수가 포함된 타입 (discussions API 응답 형태)
interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
    opinionCount?: number
    viewCount?: number
}

const PREVIEW_LIMIT = 5

export default function CommunityPreview() {
    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/discussions?limit=${PREVIEW_LIMIT}&status=진행중`, { cache: 'no-store' })
            if (!res.ok) return

            const json = await res.json()
            setTopics(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch {
            // 실패 시 섹션 미표시
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()

        // Next.js 라우터 캐시에서 복원될 때도 최신 데이터 로드
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') load()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [load])

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
                    <div key={i} className="h-16 bg-border-muted rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    if (topics.length === 0) return null

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-content-primary">커뮤니티 토론</h2>
                <div className="flex items-center gap-3">
                    <Tooltip label="최신순" text="최신 등록순으로 정렬됩니다." />
                    <Link href="/community" className="btn-neutral btn-sm">
                        전체 보기
                    </Link>
                </div>
            </div>

            <div className="space-y-3">
                {topics.map((topic) => (
                    <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                        <article className="card-hover p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    {/* 진행중 뱃지 */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 text-xs font-medium">
                                            진행중
                                        </span>
                                    </div>

                                    {/* 연결된 이슈명 */}
                                    {topic.issues?.title && (
                                        <p className="text-xs text-content-muted mb-1 line-clamp-1">
                                            {decodeHtml(topic.issues.title)}
                                        </p>
                                    )}
                                    {/* 토론 주제 본문 */}
                                    <p className="text-sm font-medium text-content-primary line-clamp-2 leading-snug mb-2">
                                        {decodeHtml(topic.body)}
                                    </p>
                                    {/* 의견 수 · 조회수 */}
                                    <div className="flex items-center gap-3 text-xs text-content-secondary">
                                        {topic.opinionCount !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <span>💬</span>
                                                <span>의견 {topic.opinionCount.toLocaleString()}</span>
                                            </span>
                                        )}
                                        {topic.viewCount !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <span>👁️</span>
                                                <span>{topic.viewCount.toLocaleString()}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-content-muted shrink-0 mt-0.5">
                                    {formatDate(topic.created_at)}
                                </span>
                            </div>
                        </article>
                    </Link>
                ))}
            </div>
        </section>
    )
}
