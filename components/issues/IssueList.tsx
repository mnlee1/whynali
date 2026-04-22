/**
 * components/issues/IssueList.tsx
 *
 * [이슈 목록 컴포넌트 - 검색/상태탭 + 카드 리스트]
 *
 * 홈, 연예, 스포츠 등 모든 목록 화면에서 사용하는 메인 컴포넌트입니다.
 * 검색창, 상태 탭(전체/점화/논란중/종결), 이슈 카드 리스트, 더 보기 버튼을 포함합니다.
 * 정렬은 기본값(최신순)으로 고정됩니다.
 *
 * initialData prop이 제공되면 SSR 데이터로 즉시 렌더링하고,
 * 필터/검색 변경 시에는 클라이언트에서 새로 fetch합니다.
 *
 * 사용 예시:
 *   <IssueList category="연예" />  // 연예 카테고리 목록
 *   <IssueList />                   // 전체 목록
 *   <IssueList initialLimit={10} /> // 초기 10개만 표시
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Masonry from 'react-masonry-css'
import { getIssues } from '@/lib/api/issues'
import IssueCard from './IssueCard'
import SearchBar from '@/components/common/SearchBar'
import Tooltip from '@/components/common/Tooltip'
import type { Issue } from '@/types/issue'

interface IssueListProps {
    category?: string       // 카테고리 (연예, 스포츠 등). 없으면 전체 목록
    initialLimit?: number   // 초기 로드 개수 (기본 20개)
    hideSearch?: boolean    // 검색바 숨김 여부
    showFullLabel?: boolean // 전체 탭을 "전체 이슈"로 표시 (기본: false)
    initialData?: { data: Issue[]; total: number } // SSR에서 전달받은 초기 데이터
    initialTabCounts?: Record<string, number>       // SSR에서 전달받은 탭별 카운트
    infiniteScroll?: boolean                        // 인피니트 스크롤 여부 (기본: false)
}

// 상태 탭 목록
const STATUS_TABS = [
    { value: '', label: '전체 이슈', fullLabel: '전체 이슈', icon: null },
    { value: '점화', label: '점화 중', fullLabel: '점화 중', icon: '🔥' },
    { value: '논란중', label: '화제 집중', fullLabel: '화제 집중', icon: '⚡' },
    { value: '종결', label: '종결', fullLabel: '종결', icon: '🏁' },
]

const LIMIT = 6
const DEBOUNCE_MS = 350

const breakpointColumns = {
    default: 2,
    767: 1,
}

export default function IssueList({ category, initialLimit, hideSearch, showFullLabel, initialData, initialTabCounts, infiniteScroll = false }: IssueListProps) {
    const [issues, setIssues] = useState<Issue[]>(initialData?.data ?? [])
    const [total, setTotal] = useState(initialData?.total ?? 0)
    const [loading, setLoading] = useState(!initialData)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [tabCounts, setTabCounts] = useState<Record<string, number>>(initialTabCounts ?? {})
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const offsetRef = useRef(initialData?.data.length ?? 0)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const loadLimit = initialLimit ?? LIMIT
    // 마운트 시 initialData가 있으면 첫 fetch 건너뜀
    const skipNextFetch = useRef(!!initialData)

    useEffect(() => {
        if (initialTabCounts && !searchQuery) return  // 검색 중엔 항상 재조회
        async function fetchCounts() {
            const tabKeys = ['', '점화', '논란중', '종결']
            const results = await Promise.allSettled(
                tabKeys.map(s => getIssues({ category, status: s || undefined, sort: 'latest', limit: 1, offset: 0, q: searchQuery || undefined }))
            )
            const counts: Record<string, number> = {}
            tabKeys.forEach((s, i) => {
                const r = results[i]
                if (r.status === 'fulfilled') counts[s] = r.value.total
            })
            setTabCounts(counts)
        }
        fetchCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, searchQuery])

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

    const fetchIssues = async () => {
        try {
            setLoading(true)
            setError(null)
            offsetRef.current = 0

            const response = await getIssues({
                category,
                status: statusFilter || undefined,
                q: searchQuery || undefined,
                sort: 'latest',
                limit: loadLimit,
                offset: 0,
            })

            setIssues(response.data)
            setTotal(response.total)
            offsetRef.current = response.data.length
        } catch (err) {
            setError(err instanceof Error ? err.message : '목록 조회 실패')
        } finally {
            setLoading(false)
        }
    }

    const fetchMore = async () => {
        if (loadingMore) return

        try {
            setLoadingMore(true)
            const currentOffset = offsetRef.current

            const response = await getIssues({
                category,
                status: statusFilter || undefined,
                q: searchQuery || undefined,
                sort: 'latest',
                limit: LIMIT,
                offset: currentOffset,
            })

            setIssues((prev) => [...prev, ...response.data])
            setTotal(response.total)
            offsetRef.current = currentOffset + response.data.length
        } catch (err) {
            setError(err instanceof Error ? err.message : '더 보기 실패')
        } finally {
            setLoadingMore(false)
        }
    }

    useEffect(() => {
        if (skipNextFetch.current) {
            skipNextFetch.current = false
            return
        }
        fetchIssues()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, statusFilter, searchQuery])

    useEffect(() => {
        if (!infiniteScroll) return
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && issues.length < total && !loadingMore && !loading) {
                fetchMore()
            }
        }, { threshold: 0.1 })
        observer.observe(sentinel)
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [infiniteScroll, issues.length, total, loadingMore, loading])

    return (
        <div className="space-y-6">
            {/* 검색창 */}
            {!hideSearch && (
                <SearchBar
                    value={searchInput}
                    onChange={handleSearchChange}
                    onSearch={handleSearch}
                />
            )}

            {/* 검색 결과 수 */}
            {searchQuery && !loading && (
                <p className="text-xl text-content-primary">
                    &lsquo;{searchQuery}&rsquo;에 대한 <span className="font-medium text-primary">{total.toLocaleString()}</span>건의 검색결과가 있습니다.
                </p>
            )}

            {/* 타이틀 + 툴팁 — 카테고리 페이지에서는 숨김 */}
            {!category && (
                <div className="flex items-center gap-0.5">
                    <h2 className="text-base font-bold text-content-primary">왜 난리야?</h2>
                    <Tooltip
                        label=""
                        align="left"
                        width="w-max max-w-[290px]"
                        text={
                            <span className="flex flex-col gap-1">
                                <span>최신 등록순으로 정렬됩니다.</span>
                                <span>· 점화 중: 반응이 급격히 늘어나는 이슈</span>
                                <span>· 화제 집중: 반응이 활발한 이슈</span>
                                <span>· 종결: 관심이 줄어든 이슈</span>
                            </span>
                        }
                    />
                </div>
            )}

            {/* 상태 탭 */}
            <div className={`w-full flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5${category ? ' !mt-10' : ''}`}>
                {STATUS_TABS.map((tab) => {
                    const isActive = statusFilter === tab.value
                    const count = tabCounts[tab.value]
                    return (
                        <button
                            key={tab.value}
                            onClick={() => setStatusFilter(tab.value)}
                            className={[
                                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                            ].join(' ')}
                        >
                            {tab.icon && <span className="leading-none">{tab.icon}</span>}
                            <span>{showFullLabel ? tab.fullLabel : tab.label}</span>
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

            {/* 에러 */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 로딩 스켈레톤 (초기 + 탭 전환 시) */}
            {loading && (
                <Masonry
                    breakpointCols={breakpointColumns}
                    className="flex gap-3 w-auto -ml-3"
                    columnClassName="pl-3 bg-clip-padding"
                >
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="card-hover p-5 h-48 flex flex-col gap-3 mb-3">
                            <div className="h-4 bg-border-muted rounded animate-pulse w-1/3" />
                            <div className="h-3 bg-border-muted rounded animate-pulse w-full" />
                            <div className="h-3 bg-border-muted rounded animate-pulse w-4/5" />
                            <div className="h-3 bg-border-muted rounded animate-pulse w-2/3 mt-1" />
                            <div className="flex gap-4 mt-auto">
                                {[0,1,2,3].map(j => <div key={j} className="h-3 w-8 bg-border-muted rounded animate-pulse" />)}
                            </div>
                        </div>
                    ))}
                </Masonry>
            )}

            {/* 빈 목록 */}
            {!loading && issues.length === 0 && (
                <div className="text-center py-12 text-content-secondary text-sm">
                    이슈가 없습니다.
                </div>
            )}

            {/* 이슈 카드 리스트 */}
            {!loading && issues.length > 0 && (
                <Masonry
                    breakpointCols={breakpointColumns}
                    className="flex gap-3 w-auto -ml-3"
                    columnClassName="pl-3 bg-clip-padding"
                >
                    {issues.map((issue) => (
                        <div key={issue.id} className="mb-3">
                            <IssueCard issue={issue} />
                        </div>
                    ))}
                </Masonry>
            )}

            {/* 더 보기 — 인피니트 스크롤 or 버튼 */}
            {infiniteScroll ? (
                <>
                    <div ref={sentinelRef} className="h-4" />
                    {loadingMore && (
                        <div className="text-center py-4 text-sm text-content-muted">로딩 중...</div>
                    )}
                </>
            ) : (
                issues.length < total && (
                    <div className="text-center pt-6">
                        <button
                            onClick={fetchMore}
                            disabled={loadingMore}
                            className="btn-neutral btn-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white active:bg-white"
                        >
                            {loadingMore ? '로딩 중...' : (
                                <>
                                    더 보기
                                    <span className="text-xs text-content-muted font-normal flex items-center gap-1.5">
                                        <span>·</span>
                                        <span>{issues.length} / {total}</span>
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                )
            )}

        </div>
    )
}
