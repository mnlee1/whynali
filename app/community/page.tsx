'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import SearchBar from '@/components/common/SearchBar'
import type { DiscussionTopic } from '@/types'

type TopicWithIssue = DiscussionTopic & {
    issues: { id: string; title: string } | null
    opinionCount?: number
    viewCount?: number
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
    const router = useRouter()
    /* 이슈 상세에서 "이 이슈의 커뮤니티" 진입 시 issue_id 파라미터로 필터링 */
    const issueIdFilter = searchParams.get('issue_id') ?? ''

    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<FilterStatus>((searchParams.get('status') as FilterStatus) ?? '')
    /* 연결 이슈 제목 (issue_id 필터 시 헤더에 표시) */
    const [issueTitle, setIssueTitle] = useState<string | null>(null)

    /* topics에서 이슈별 토픽 수 계산 (렌더 시점마다 파생) */
    const issueTopicCountMap = topics.reduce<Record<string, number>>((acc, t) => {
        if (t.issues?.id) {
            acc[t.issues.id] = (acc[t.issues.id] ?? 0) + 1
        }
        return acc
    }, {})

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
                    <p className="text-xs text-primary mb-1">이슈 연결 토론</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-content-primary">{issueTitle}</h1>
                </div>
            ) : (
                <h1 className="text-2xl md:text-3xl font-bold text-content-primary mb-6">커뮤니티</h1>
            )}

            {/* 검색 */}
            {!issueIdFilter && (
                <div className="mb-6">
                    <SearchBar
                        value={searchInput}
                        onChange={handleSearchChange}
                        onSearch={handleSearch}
                        placeholder="토론 주제 검색..."
                    />
                </div>
            )}

            {/* 상태 필터 탭 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-6">
                <div className="flex flex-wrap gap-1.5">
                    {FILTER_LABELS.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setStatusFilter(value)}
                            className={[
                                'flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap',
                                statusFilter === value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {issueIdFilter && (
                    <Link
                        href="/community"
                        className="text-xs text-content-secondary hover:text-content-primary font-medium whitespace-nowrap"
                    >
                        전체 커뮤니티 보기 →
                    </Link>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                    {error}
                </div>
            )}

            {/* 스켈레톤 */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 bg-surface-subtle rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : topics.length === 0 ? (
                <p className="text-sm text-content-muted text-center py-12">
                    {searchQuery ? `"${searchQuery}"에 대한 토론 주제가 없습니다.` : '등록된 토론 주제가 없습니다.'}
                </p>
            ) : (
                <>
                    <p className="text-sm text-content-secondary mb-4">총 {total.toLocaleString()}개</p>
                    <div className="space-y-3">
                        {topics.map((topic) => (
                            <Link key={topic.id} href={`/community/${topic.id}`} className="block">
                                <article className="card-hover p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* 상태 뱃지 */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={[
                                                    'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium',
                                                    topic.approval_status === '진행중'
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-surface-subtle text-content-muted border-border'
                                                ].join(' ')}>
                                                    {topic.approval_status}
                                                </span>
                                            </div>
                                            
                                            {/* 연결된 이슈명 */}
                                            {!issueIdFilter && topic.issues?.id && topic.issues?.title && (
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
                                            {/* 토론 주제 본문 */}
                                            <p className="text-base font-medium text-content-primary line-clamp-2 leading-snug mb-2">
                                                {decodeHtml(topic.body)}
                                            </p>
                                            {/* 통계 */}
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

                    {/* 더보기 */}
                    {topics.length < total && (
                        <div className="text-center mt-6">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="btn-neutral btn-md"
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
                <h1 className="text-2xl md:text-3xl font-bold text-content-primary mb-6">커뮤니티</h1>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 bg-surface-subtle rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        }>
            <CommunityContent />
        </Suspense>
    )
}
