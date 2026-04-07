/**
 * components/community/CommunityPreview.tsx
 *
 * [커뮤니티 최신 토론 주제 미리보기]
 *
 * 메인화면 하단에 배치되는 섹션입니다.
 * 진행중인 토론 주제를 최대 5개 표시합니다.
 *
 * initialTopics prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
 * visibilitychange 이벤트로 탭 복귀 시 최신 데이터를 다시 로드합니다.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DiscussionTopic } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import Tooltip from '@/components/common/Tooltip'

interface TopicWithIssue extends DiscussionTopic {
    issues?: { id: string; title: string } | null
    opinionCount?: number
    viewCount?: number
}

const PREVIEW_LIMIT = 5

interface Props {
    initialTopics?: TopicWithIssue[]
}

export default function CommunityPreview({ initialTopics }: Props) {
    const router = useRouter()
    const [topics, setTopics] = useState<TopicWithIssue[]>(initialTopics ?? [])
    const [loading, setLoading] = useState(!initialTopics)
    const hasInitialData = useRef(!!initialTopics?.length)

    /* topics에서 이슈별 토픽 수 계산 (렌더 시점마다 파생) */
    const issueTopicCountMap = topics.reduce<Record<string, number>>((acc, t) => {
        if (t.issues?.id) {
            acc[t.issues.id] = (acc[t.issues.id] ?? 0) + 1
        }
        return acc
    }, {})

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/discussions?limit=${PREVIEW_LIMIT}&status=진행중`, { cache: 'no-store' })
            if (!res.ok) return
            const json = await res.json()
            setTopics(json.data ?? [])
        } catch {
            // 실패 시 섹션 미표시
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        // 초기 데이터가 없을 때만 마운트 시 fetch
        if (!hasInitialData.current) {
            load()
        }

        // 탭 복귀 시 최신 데이터 갱신
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
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 text-xs font-medium">
                                            진행중
                                        </span>
                                    </div>

                                    {topic.issues?.id && topic.issues?.title && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                if (!topic.issues?.id) return
                                                router.push(`/community?issue_id=${topic.issues.id}`)
                                            }}
                                            className="inline-block text-sm text-primary hover:underline mb-1 line-clamp-1 text-left transition-colors"
                                        >
                                            {decodeHtml(topic.issues?.title ?? '')} ({issueTopicCountMap[topic.issues?.id ?? ''] ?? 1}) →
                                        </button>
                                    )}
                                    <p className="text-base font-medium text-content-primary line-clamp-2 leading-snug mb-2">
                                        {decodeHtml(topic.body)}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-content-secondary">
                                        {topic.viewCount !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span>{topic.viewCount.toLocaleString()}</span>
                                            </span>
                                        )}
                                        {topic.opinionCount !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                                                </svg>
                                                <span>{topic.opinionCount.toLocaleString()}</span>
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
