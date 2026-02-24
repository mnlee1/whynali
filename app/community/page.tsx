'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { DiscussionTopic } from '@/types'

type TopicWithIssue = DiscussionTopic & {
    issues: { id: string; title: string } | null
}

const PAGE_SIZE = 20

function CommunityContent() {
    const searchParams = useSearchParams()
    /* 이슈 상세에서 "이 이슈의 커뮤니티" 진입 시 issue_id 파라미터로 필터링 */
    const issueIdFilter = searchParams.get('issue_id') ?? ''

    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [activeQ, setActiveQ] = useState('')
    /* 연결 이슈 제목 (issue_id 필터 시 헤더에 표시) */
    const [issueTitle, setIssueTitle] = useState<string | null>(null)

    const loadTopics = useCallback(async (q: string, currentOffset: number, append: boolean) => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(currentOffset),
            })
            if (q) params.set('q', q)
            if (issueIdFilter) params.set('issue_id', issueIdFilter)
            const res = await fetch(`/api/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const data: TopicWithIssue[] = json.data ?? []
            setTopics((prev) => append ? [...prev, ...data] : data)
            setTotal(json.total ?? 0)
            /* issue_id 필터 시 첫 항목의 이슈 제목 저장 */
            if (issueIdFilter && data.length > 0 && data[0].issues?.title) {
                setIssueTitle(data[0].issues.title)
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '목록 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [issueIdFilter])

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
        <div className="container mx-auto px-4 py-6 md:py-8">
            {issueIdFilter && issueTitle ? (
                <div className="mb-4">
                    <p className="text-xs text-purple-600 mb-1">이슈 연결 토론</p>
                    <h1 className="text-2xl md:text-3xl font-bold">{issueTitle}</h1>
                    <Link href="/community" className="text-sm text-gray-400 hover:text-gray-600 mt-1 inline-block">
                        전체 커뮤니티 보기
                    </Link>
                </div>
            ) : (
                <h1 className="text-2xl md:text-3xl font-bold mb-6">커뮤니티</h1>
            )}

            {/* 검색 */}
            <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="토론 주제 검색..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-neutral-400"
                />
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 font-medium transition-colors"
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
                                    className="block p-4 border border-gray-200 rounded-xl hover:border-purple-300 transition-colors"
                                >
                                    {/* 상태 배지 행 */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={[
                                            'text-xs px-2 py-0.5 rounded border font-medium',
                                            topic.approval_status === '종료'
                                                ? 'bg-gray-50 text-gray-500 border-gray-200'
                                                : 'bg-purple-100 text-purple-700 border-purple-300',
                                        ].join(' ')}>
                                            {topic.approval_status === '종료' ? '종료' : '토론 중'}
                                        </span>
                                        {topic.is_ai_generated && (
                                            <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-200 font-medium">
                                                AI 생성
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-800 line-clamp-2 mb-2">
                                        {topic.body}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        {topic.issues && (
                                            <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-100">
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
                                className="text-sm px-5 py-2 border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
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

export default function CommunityPage() {
    return (
        <Suspense fallback={
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-6">커뮤니티</h1>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-2">
                            <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                            <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        }>
            <CommunityContent />
        </Suspense>
    )
}
