'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import SearchBar from '@/components/common/SearchBar'
import type { DiscussionTopic } from '@/types'

// ISR: 15분(900초)마다 페이지 재생성
export const revalidate = 900

type TopicWithIssue = DiscussionTopic & {
    issues: { id: string; title: string } | null
    opinionCount?: number
}

type FilterStatus = '' | '진행중' | '마감'

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: '진행중', label: '진행중' },
    { value: '마감', label: '마감' },
]

const PAGE_SIZE = 20
const DEBOUNCE_MS = 350

function CommunityContent() {
    const searchParams = useSearchParams()
    /* 이슈 상세에서 "이 이슈의 커뮤니티" 진입 시 issue_id 파라미터로 필터링 */
    const issueIdFilter = searchParams.get('issue_id') ?? ''

    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('')
    /* 연결 이슈 제목 (issue_id 필터 시 헤더에 표시) */
    const [issueTitle, setIssueTitle] = useState<string | null>(null)

    const offsetRef = useRef(0)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    /* 검색 입력 → debounce → searchQuery 업데이트 */
    const handleSearchChange = (value: string) => {
        setSearchInput(value)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
            setSearchQuery(value)
        }, DEBOUNCE_MS)
    }

    /* Enter 키: debounce 취소 후 즉시 검색 트리거 */
    const handleSearch = () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        setSearchQuery(searchInput)
    }

    const loadTopics = useCallback(async (q: string, status: FilterStatus, currentOffset: number, append: boolean) => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(currentOffset),
            })
            if (q) params.set('q', q)
            if (status) params.set('status', status)
            if (issueIdFilter) params.set('issue_id', issueIdFilter)
            const res = await fetch(`/api/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const data: TopicWithIssue[] = json.data ?? []
            setTopics((prev) => append ? [...prev, ...data] : data)
            setTotal(json.total ?? 0)
            /* issue_id 필터 시 첫 항목의 이슈 제목 저장 */
            if (issueIdFilter && data.length > 0 && data[0].issues?.title) {
                setIssueTitle(decodeHtml(data[0].issues.title))
            }
            if (!append) {
                offsetRef.current = data.length
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '목록 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [issueIdFilter])

    /* 검색어 또는 상태 필터 변경 시 목록 초기화 및 재로드 */
    useEffect(() => {
        setLoading(true)
        setError(null)
        loadTopics(searchQuery, statusFilter, 0, false)
    }, [searchQuery, statusFilter, loadTopics])

    const handleLoadMore = () => {
        const next = offsetRef.current
        setLoadingMore(true)
        loadTopics(searchQuery, statusFilter, next, true)
        offsetRef.current = next + PAGE_SIZE
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
            <div className="mb-6">
                <SearchBar
                    value={searchInput}
                    onChange={handleSearchChange}
                    onSearch={handleSearch}
                    placeholder="토론 주제 검색..."
                />
            </div>

            {/* 상태 필터 탭 */}
            <div className="flex gap-2 mb-6">
                {FILTER_LABELS.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setStatusFilter(value)}
                        className={[
                            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                            statusFilter === value
                                ? 'bg-purple-600 text-white'
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
                    {error}
                </div>
            )}

            {/* 스켈레톤 */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 bg-neutral-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : topics.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                    {searchQuery ? `"${searchQuery}"에 대한 토론 주제가 없습니다.` : '등록된 토론 주제가 없습니다.'}
                </p>
            ) : (
                <>
                    <p className="text-sm text-gray-500 mb-4">총 {total.toLocaleString()}개</p>
                    <div className="space-y-3">
                        {topics.map((topic) => (
                            <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                                <article className="p-4 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* 상태 뱃지 */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={[
                                                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                                    topic.approval_status === '진행중'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                ].join(' ')}>
                                                    {topic.approval_status}
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

                    {/* 더보기 */}
                    {topics.length < total && (
                        <div className="text-center mt-6">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="px-5 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingMore ? '로딩 중...' : '더 보기'}
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
                        <div key={i} className="h-20 bg-neutral-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        }>
            <CommunityContent />
        </Suspense>
    )
}
