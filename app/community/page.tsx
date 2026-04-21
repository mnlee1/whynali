'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, MessageSquare, MessageCircleMore, BadgeCheck, Users, ChevronRight } from 'lucide-react'
import { decodeHtml } from '@/lib/utils/decode-html'

import SearchBar from '@/components/common/SearchBar'
import type { DiscussionTopic } from '@/types'

type IssueInfo = {
    id: string
    title: string
    description?: string | null
}

type TopicWithIssue = DiscussionTopic & {
    issues: IssueInfo | null
    opinionCount?: number
    viewCount?: number
}

type IssueStats = {
    viewCount: number
    commentCount: number
    voteCount: number
    discussionCount: number
}

type FilterStatus = '' | '진행중' | '마감'

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: '진행중', label: '토론 진행중' },
    { value: '마감', label: '토론 마감' },
]

const PAGE_SIZE = 20
const DEBOUNCE_MS = 350

function CommunityCard({
    topic,
    issueIdFilter,
    issueTopicCount,
    stats,
    onMoreClick,
}: {
    topic: TopicWithIssue
    issueIdFilter: string
    issueTopicCount: number
    stats?: IssueStats | null
    onMoreClick: (issueId: string) => void
}) {
    const issueDescription = topic.issues?.description ?? null

    return (
        <article className="card-hover p-5 flex flex-col">
            {/* 이슈 영역 → 이슈 상세 */}
            {topic.issues?.id ? (
                <Link href={`/issue/${topic.issues.id}`} className="block mb-3">
                    {/* 이슈 제목 */}
                    <div className="flex items-center gap-0.5 mb-1.5">
                        <h3 className="text-base font-semibold text-content-primary line-clamp-2">
                            {decodeHtml(topic.issues.title)}
                        </h3>
                        <ChevronRight className="w-4 h-4 text-content-primary shrink-0" strokeWidth={2.5} />
                    </div>

                    {/* 이슈 설명 */}
                    {issueDescription && (
                        <p className="text-xs text-content-secondary line-clamp-2 leading-relaxed mb-3">
                            {issueDescription}
                        </p>
                    )}

                    {/* 이슈 통계 */}
                    <div className="flex items-center gap-4 text-xs text-content-secondary">
                        <span className="flex items-center gap-1">
                            <Eye className="w-4 h-4" strokeWidth={1.8} />
                            {stats ? stats.viewCount.toLocaleString() : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
                            {stats ? stats.commentCount.toLocaleString() : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                            <BadgeCheck className="w-4 h-4" strokeWidth={1.8} />
                            {stats ? stats.voteCount.toLocaleString() : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" strokeWidth={1.8} />
                            {stats ? stats.discussionCount.toLocaleString() : '—'}
                        </span>
                    </div>
                </Link>
            ) : null}

            {/* 토론 영역 → 토론 상세 */}
            <div className={topic.issues?.id ? 'border-t border-border pt-3' : ''}>
                <Link
                    href={`/community/${topic.id}`}
                    className={`block pl-3 border-l-2 transition-colors group ${
                        topic.approval_status === '진행중' ? 'border-primary' : 'border-border'
                    }`}
                >
                    {/* 상태 뱃지 */}
                    <div className="mb-1.5">
                        <span className={[
                            'inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium',
                            topic.approval_status === '진행중'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-surface-muted text-content-muted border-border'
                        ].join(' ')}>
                            {topic.approval_status === '진행중' ? '토론 진행중' : '토론 마감'}
                        </span>
                    </div>

                    {/* 토론 제목 */}
                    <p className="text-sm font-medium text-content-primary line-clamp-1 mb-3 group-hover:text-primary transition-colors">
                        {decodeHtml(topic.body)}
                    </p>

                    {/* 토론 통계 */}
                    <div className="flex items-center gap-3 text-xs text-content-secondary">
                        {topic.viewCount !== undefined && (
                            <span className="flex items-center gap-1">
                                <Eye className="w-4 h-4" strokeWidth={1.8} />
                                <span>{topic.viewCount.toLocaleString()}</span>
                            </span>
                        )}
                        {topic.opinionCount !== undefined && (
                            <span className="flex items-center gap-1">
                                <MessageCircleMore className="w-4 h-4" strokeWidth={1.8} />
                                <span>{topic.opinionCount.toLocaleString()}</span>
                            </span>
                        )}
                    </div>
                </Link>
            </div>

            {/* 연결 이슈의 다른 토론 더보기 — DB 전체 토론 수가 현재 페이지에 보이는 수보다 많을 때만 표시 */}
            {!issueIdFilter && topic.issues?.id && stats && stats.discussionCount > issueTopicCount && (
                <button
                    type="button"
                    onClick={() => onMoreClick(topic.issues!.id)}
                    className="mt-4 text-left text-xs text-content-secondary hover:text-primary hover:underline transition-colors"
                >
                    연결 이슈의 토론 {stats.discussionCount}개 더보기 →
                </button>
            )}
        </article>
    )
}

function CommunityContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const issueIdFilter = searchParams.get('issue_id') ?? ''

    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<FilterStatus>((searchParams.get('status') as FilterStatus) ?? '')
    const [issueTitle, setIssueTitle] = useState<string | null>(null)
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
    const [statsMap, setStatsMap] = useState<Record<string, IssueStats>>({})

    const issueTopicCountMap = topics.reduce<Record<string, number>>((acc, t) => {
        if (t.issues?.id) {
            acc[t.issues.id] = (acc[t.issues.id] ?? 0) + 1
        }
        return acc
    }, {})

    const offsetRef = useRef(0)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        async function fetchCounts() {
            const tabKeys: FilterStatus[] = ['', '진행중', '마감']
            const results = await Promise.allSettled(
                tabKeys.map(s => {
                    const params = new URLSearchParams({ limit: '1', offset: '0' })
                    if (s) params.set('status', s)
                    if (issueIdFilter) params.set('issue_id', issueIdFilter)
                    return fetch(`/api/discussions?${params}`).then(r => r.json())
                })
            )
            const counts: Record<string, number> = {}
            tabKeys.forEach((s, i) => {
                const r = results[i]
                if (r.status === 'fulfilled') counts[s] = r.value.total ?? 0
            })
            setTabCounts(counts)
        }
        fetchCounts()
    }, [issueIdFilter])

    const handleSearchChange = (value: string) => {
        setSearchInput(value)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
            setSearchQuery(value)
        }, DEBOUNCE_MS)
    }

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
            if (issueIdFilter && data.length > 0 && data[0].issues?.title) {
                setIssueTitle(decodeHtml(data[0].issues.title))
            }
            if (!append) {
                offsetRef.current = data.length
            }

            // 배치로 이슈 통계 조회 (N+1 → 요청 1회)
            const issueIds = [...new Set(data.map(t => t.issues?.id).filter(Boolean) as string[])]
            if (issueIds.length > 0) {
                fetch(`/api/issues/stats/batch?ids=${issueIds.join(',')}`)
                    .then(r => r.ok ? r.json() : {})
                    .then((batch: Record<string, IssueStats>) => {
                        setStatsMap(prev => append ? { ...prev, ...batch } : batch)
                    })
                    .catch(() => {})
            } else if (!append) {
                setStatsMap({})
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '목록 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [issueIdFilter])

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
                        placeholder="토론 주제 검색"
                    />
                </div>
            )}

            {/* 상태 필터 탭 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-6">
                <div className="w-full flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                    {FILTER_LABELS.map(({ value, label }) => {
                        const isActive = statusFilter === value
                        const count = tabCounts[value]
                        return (
                            <button
                                key={value}
                                onClick={() => setStatusFilter(value)}
                                className={[
                                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap',
                                    isActive
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                                ].join(' ')}
                            >
                                <span>{label}</span>
                                {count !== undefined && count > 0 && (
                                    <span className={`inline-flex items-center justify-center min-w-[20px] h-4 text-[10px] font-semibold px-1 rounded-full ${
                                        isActive ? 'bg-white/30 text-white' : 'bg-primary/10 text-primary'
                                    }`}>
                                        {count.toLocaleString()}
                                    </span>
                                )}
                            </button>
                        )
                    })}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="card-hover p-5 flex flex-col gap-3">
                            <div className="h-4 bg-border-muted rounded animate-pulse w-3/4" />
                            <div className="h-3 bg-border-muted rounded animate-pulse w-full" />
                            <div className="h-3 bg-border-muted rounded animate-pulse w-2/3" />
                            <div className="flex gap-4">
                                {[0,1,2,3].map(j => <div key={j} className="h-3 w-8 bg-border-muted rounded animate-pulse" />)}
                            </div>
                            <div className="border-t border-border-muted pt-3 space-y-2">
                                <div className="h-3 bg-border-muted rounded animate-pulse w-1/4" />
                                <div className="h-3 bg-border-muted rounded animate-pulse w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : topics.length === 0 ? (
                <p className="text-sm text-content-muted text-center py-12">
                    {searchQuery ? `"${searchQuery}"에 대한 토론 주제가 없습니다.` : '등록된 토론 주제가 없습니다.'}
                </p>
            ) : (
                <>
                    <p className="text-sm text-content-secondary mb-4">총 {total.toLocaleString()}개</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {topics.map((topic) => (
                            <CommunityCard
                                key={topic.id}
                                topic={topic}
                                issueIdFilter={issueIdFilter}
                                issueTopicCount={issueTopicCountMap[topic.issues?.id ?? ''] ?? 0}
                                stats={statsMap[topic.issues?.id ?? ''] ?? null}
                                onMoreClick={(issueId) => router.push(`/community?issue_id=${issueId}`)}
                            />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="card-hover p-5 h-48 animate-pulse bg-surface-subtle rounded-xl" />
                    ))}
                </div>
            </div>
        }>
            <CommunityContent />
        </Suspense>
    )
}
