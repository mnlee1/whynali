'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { DiscussionTopic } from '@/types'

type TopicWithIssue = DiscussionTopic & {
    issues: { id: string; title: string } | null
}

const PAGE_SIZE = 20

export default function CommunityPage() {
    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [activeQ, setActiveQ] = useState('')

    const loadTopics = useCallback(async (q: string, currentOffset: number, append: boolean) => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(currentOffset),
            })
            if (q) params.set('q', q)
            const res = await fetch(`/api/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setTopics((prev) => append ? [...prev, ...(json.data ?? [])] : (json.data ?? []))
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '목록 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [])

    useEffect(() => {
        loadTopics('', 0, false)
    }, [loadTopics])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const q = searchInput.trim()
        setActiveQ(q)
        setOffset(0)
        setLoading(true)
        loadTopics(q, 0, false)
    }

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadTopics(activeQ, next, true)
    }

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">커뮤니티</h1>

            {/* 검색 */}
            <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="토론 주제 검색..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                />
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    검색
                </button>
            </form>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
                    {error}
                </div>
            )}

            {/* 스켈레톤 */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-2">
                            <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                            <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            ) : topics.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                    {activeQ ? `"${activeQ}"에 대한 토론 주제가 없습니다.` : '등록된 토론 주제가 없습니다.'}
                </p>
            ) : (
                <>
                    <p className="text-sm text-gray-500 mb-3">총 {total.toLocaleString()}개</p>
                    <ul className="space-y-3">
                        {topics.map((topic) => (
                            <li key={topic.id}>
                                <Link
                                    href={`/community/${topic.id}`}
                                    className="block p-4 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                                >
                                    {/* 상태 배지 행 */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200">
                                            진행중
                                        </span>
                                        {topic.is_ai_generated && (
                                            <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-200">
                                                AI 생성
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-800 line-clamp-2 mb-2">
                                        {topic.body}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        {topic.issues && (
                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                                                {topic.issues.title}
                                            </span>
                                        )}
                                        <span>
                                            {new Date(topic.created_at).toLocaleDateString('ko-KR')}
                                        </span>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {/* 더보기 */}
                    {topics.length < total && (
                        <div className="text-center mt-6">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="text-sm px-5 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                                {loadingMore ? '불러오는 중...' : `더보기 (${total - topics.length}개 남음)`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
