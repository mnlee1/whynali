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

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { DiscussionTopic } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'

// 토론 주제에 연결된 이슈 정보와 의견 수가 포함된 타입 (discussions API 응답 형태)
interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
    opinionCount?: number
}

const PREVIEW_LIMIT = 5

export default function CommunityPreview() {
    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`/api/discussions?limit=${PREVIEW_LIMIT}&status=진행중`)
                if (!res.ok) return

                const json = await res.json()
                setTopics(json.data ?? [])
                setTotal(json.total ?? 0)
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
            <div className="space-y-2">
                {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
                    <div key={i} className="h-16 bg-neutral-100 rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    if (topics.length === 0) return null

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-neutral-900">커뮤니티 토론</h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400">
                        최신순으로 정렬 됩니다.
                    </span>
                    <Link
                        href="/community"
                        className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                    >
                        전체 보기
                    </Link>
                </div>
            </div>

            <div className="space-y-3">
                {topics.map((topic) => (
                    <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                        <article className="p-4 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    {/* 진행중 뱃지 */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                            진행중
                                        </span>
                                    </div>
                                    
                                    {/* 연결된 이슈명 */}
                                    {topic.issues?.title && (
                                        <p className="text-xs text-neutral-400 mb-1 line-clamp-1">
                                            {decodeHtml(topic.issues.title)}
                                        </p>
                                    )}
                                    {/* 토론 주제 본문 */}
                                    <p className="text-sm font-medium text-neutral-800 line-clamp-2 leading-snug mb-2">
                                        {decodeHtml(topic.body)}
                                    </p>
                                    {/* 의견 수 */}
                                    {topic.opinionCount !== undefined && (
                                        <div className="flex items-center gap-1 text-xs text-neutral-500">
                                            <span>💬</span>
                                            <span>의견 {topic.opinionCount.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs text-neutral-400 shrink-0 mt-0.5">
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
