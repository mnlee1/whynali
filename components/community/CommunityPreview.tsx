/**
 * components/community/CommunityPreview.tsx
 *
 * [커뮤니티 최신 토론 주제 미리보기]
 *
 * 메인화면 하단에 배치되는 섹션입니다.
 * 최근 승인된 토론 주제 3개를 미리 보여줘 커뮤니티 진입을 유도합니다.
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

// 토론 주제에 연결된 이슈 정보가 포함된 타입 (discussions API 응답 형태)
interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
}

// 날짜 포맷
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR')
}

export default function CommunityPreview() {
    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/discussions?limit=3')
                if (!res.ok) return

                const json = await res.json()
                setTopics(json.data ?? [])
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
                {[0, 1, 2].map((i) => (
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
                <Link
                    href="/community"
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                    전체 보기
                </Link>
            </div>

            <div className="space-y-3">
                {topics.map((topic) => (
                    <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                        <article className="p-4 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    {/* 연결된 이슈명 */}
                                    {topic.issues?.title && (
                                        <p className="text-xs text-neutral-400 mb-1 line-clamp-1">
                                            {decodeHtml(topic.issues.title)}
                                        </p>
                                    )}
                                    {/* 토론 주제 본문 */}
                                    <p className="text-sm font-medium text-neutral-800 line-clamp-2 leading-snug">
                                        {decodeHtml(topic.body)}
                                    </p>
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
