'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import { Eye, MessageCircleMore, ChevronDown } from 'lucide-react'
import { decodeHtml } from '@/lib/utils/decode-html'

import SearchBar from '@/components/common/SearchBar'
import type { DiscussionTopic } from '@/types'

type IssueInfo = {
    id: string
    title: string
}

type TopicWithIssue = DiscussionTopic & {
    issues: IssueInfo | null
    opinionCount?: number
    viewCount?: number
}

type FilterStatus = '' | '진행중' | '마감'


const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: '진행중', label: '토론 진행중' },
    { value: '마감', label: '토론 마감' },
]

const PAGE_SIZE = 20
const DEBOUNCE_MS = 350

const breakpointColumns = {
    default: 2,
    768: 1,
}

type IssueGroup = {
    issueId: string
    issue: IssueInfo | null
    topics: TopicWithIssue[]
}

function groupTopicsByIssue(topics: TopicWithIssue[]): IssueGroup[] {
    const map = new Map<string, IssueGroup>()
    for (const topic of topics) {
        const id = topic.issues?.id ?? '__no_issue__'
        if (!map.has(id)) {
            map.set(id, { issueId: id, issue: topic.issues, topics: [] })
        }
        map.get(id)!.topics.push(topic)
    }
    return Array.from(map.values())
}

function IssueGroupCard({ group }: { group: IssueGroup }) {
    return (
        <article className="card-hover p-5 flex flex-col mb-3">
            {/* 이슈 타이틀 (1번만) */}
            {group.issue?.id && (
                <div className="mb-3">
                    <h3 className="text-base font-semibold text-content-primary line-clamp-2">
                        {decodeHtml(group.issue.title)}
                    </h3>
                </div>
            )}

            {/* 토론 목록 */}
            <div className={group.issue?.id ? 'border-t border-border pt-3 flex flex-col gap-5' : 'flex flex-col gap-5'}>
                {group.topics.map((topic) => (
                    <div key={topic.id}>
                        <Link
                            href={`/community/${topic.id}`}
                            className={`block pl-3 border-l-2 transition-colors group ${
                                topic.approval_status === '진행중' ? 'border-primary' : 'border-border'
                            }`}
                        >
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

                            <p className="text-sm font-medium text-content-primary line-clamp-1 mb-3 group-hover:text-primary transition-colors">
                                {decodeHtml(topic.body)}
                            </p>

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
                ))}
            </div>
        </article>
    )
}

type SortOrder = 'latest' | 'popular'

const SORT_LABELS: { value: SortOrder; label: string }[] = [
    { value: 'latest', label: '최신순' },
    { value: 'popular', label: '참여도순' },
]

function SortDropdown({ value, onChange }: { value: SortOrder; onChange: (v: SortOrder) => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const current = SORT_LABELS.find(l => l.value === value)

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-subtle transition-colors text-xs text-content-secondary"
            >
                <span>{current?.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} />
            </button>
            {open && (
                <div className="absolute left-0 min-[416px]:left-auto min-[416px]:right-0 top-full mt-2 w-24 bg-surface border border-border rounded-lg shadow-card z-50">
                    <div className="p-1">
                        {SORT_LABELS.map(({ value: v, label }) => (
                            <button
                                key={v}
                                onClick={() => { onChange(v); setOpen(false) }}
                                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                    v === value
                                        ? 'text-primary font-medium bg-primary/5'
                                        : 'text-content-secondary hover:bg-surface-muted'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function CommunityContent() {
    const searchParams = useSearchParams()
    const issueIdFilter = searchParams.get('issue_id') ?? ''

    const [topics, setTopics] = useState<TopicWithIssue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<FilterStatus>((searchParams.get('status') as FilterStatus) ?? '')
    const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})

    const offsetRef = useRef(0)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const hasMore = topics.length < total && !loadingMore && !loading

    useEffect(() => {
        async function fetchCounts() {
            const tabKeys: FilterStatus[] = ['', '진행중', '마감']
            const results = await Promise.allSettled(
                tabKeys.map(s => {
                    const params = new URLSearchParams({ limit: '1', offset: '0' })
                    if (s) params.set('status', s)
                    if (searchQuery) params.set('q', searchQuery)
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
    }, [searchQuery, issueIdFilter])

    const handleSearchChange = (value: string) => {
        setSearchInput(value)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS)
    }

    const handleSearch = () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        setSearchQuery(searchInput)
    }

    const loadTopics = useCallback(async (q: string, status: FilterStatus, sort: SortOrder, currentOffset: number, append: boolean) => {
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(currentOffset),
                sort,
            })
            if (q) params.set('q', q)
            if (status) params.set('status', status)
            if (issueIdFilter) params.set('issue_id', issueIdFilter)
            const res = await fetch(`/api/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const data: TopicWithIssue[] = json.data ?? []
            setTopics(prev => append ? [...prev, ...data] : data)
            setTotal(json.total ?? 0)
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

    useEffect(() => {
        setLoading(true)
        setError(null)
        loadTopics(searchQuery, statusFilter, sortOrder, 0, false)
    }, [searchQuery, statusFilter, sortOrder, loadTopics])

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && hasMore) {
                const next = offsetRef.current
                setLoadingMore(true)
                loadTopics(searchQuery, statusFilter, sortOrder, next, true)
                offsetRef.current = next + PAGE_SIZE
            }
        }, { threshold: 0.1 })
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, searchQuery, statusFilter, sortOrder, loadTopics])

    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold text-content-primary mb-6">커뮤니티</h1>

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

            {/* 검색 결과 수 */}
            {searchQuery && !loading && (
                <p className="text-xl text-content-primary mb-6">
                    &lsquo;{searchQuery}&rsquo;에 대한 <span className="font-medium text-primary">{total.toLocaleString()}</span>건의 검색결과가 있습니다.
                </p>
            )}

            {/* 상태 필터 탭 + 정렬 */}
            <div className="w-full flex flex-col items-start gap-2 min-[416px]:flex-row min-[416px]:items-center min-[416px]:justify-between mb-6 mt-10">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
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
                                {count !== undefined && (
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
                <SortDropdown value={sortOrder} onChange={setSortOrder} />
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                    {error}
                </div>
            )}

            {/* 스켈레톤 */}
            {loading ? (
                <Masonry
                    breakpointCols={breakpointColumns}
                    className="flex gap-3 w-auto -ml-3"
                    columnClassName="pl-3 bg-clip-padding"
                >
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="card-hover p-5 flex flex-col gap-3 mb-3">
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
                </Masonry>
            ) : topics.length === 0 ? (
                <p className="text-sm text-content-muted text-center py-12">
                    {searchQuery ? `"${searchQuery}"에 대한 토론 주제가 없습니다.` : '등록된 토론 주제가 없습니다.'}
                </p>
            ) : (
                <>
                    <Masonry
                        breakpointCols={breakpointColumns}
                        className="flex gap-3 w-auto -ml-3"
                        columnClassName="pl-3 bg-clip-padding"
                    >
                        {groupTopicsByIssue(topics).map((group) => (
                            <IssueGroupCard key={group.issueId} group={group} />
                        ))}
                    </Masonry>

                    {/* 인피니트 스크롤 sentinel */}
                    <div ref={sentinelRef} className="h-4" />
                    {loadingMore && (
                        <div className="text-center py-4 text-sm text-content-muted">로딩 중...</div>
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
                <h1 className="text-2xl font-bold text-content-primary mb-6">커뮤니티</h1>
                <Masonry
                    breakpointCols={breakpointColumns}
                    className="flex gap-3 w-auto -ml-3"
                    columnClassName="pl-3 bg-clip-padding"
                >
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="card-hover p-5 h-36 animate-pulse bg-surface-subtle rounded-xl mb-3" />
                    ))}
                </Masonry>
            </div>
        }>
            <CommunityContent />
        </Suspense>
    )
}
