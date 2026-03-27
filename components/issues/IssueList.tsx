/**
 * components/issues/IssueList.tsx
 * 
 * [이슈 목록 컴포넌트 - 검색/상태탭 + 카드 리스트]
 * 
 * 홈, 연예, 스포츠 등 모든 목록 화면에서 사용하는 메인 컴포넌트입니다.
 * 검색창, 상태 탭(전체/점화/논란중/종결), 이슈 카드 리스트, 더 보기 버튼을 포함합니다.
 * 정렬은 기본값(최신순)으로 고정됩니다.
 * 
 * 사용 예시:
 *   <IssueList category="연예" />  // 연예 카테고리 목록
 *   <IssueList />                   // 전체 목록
 *   <IssueList initialLimit={10} /> // 초기 10개만 표시
 */

'use client'

import { useState, useEffect, useRef } from 'react'
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
}

// 상태 탭 목록
const STATUS_TABS = [
    { value: '', label: '전체', fullLabel: '전체 이슈', icon: null },
    { value: '점화', label: '점화', fullLabel: '점화', icon: '🔥' },
    { value: '논란중', label: '논란중', fullLabel: '논란중', icon: '⚡' },
    { value: '종결', label: '종결', fullLabel: '종결', icon: '🏁' },
]

const LIMIT = 20
const DEBOUNCE_MS = 350

export default function IssueList({ category, initialLimit, hideSearch, showFullLabel }: IssueListProps) {
    const [issues, setIssues] = useState<Issue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [searchInput, setSearchInput] = useState('')     // 입력 중인 값
    const [searchQuery, setSearchQuery] = useState('')     // 실제 API 호출 트리거 값
    const [statusFilter, setStatusFilter] = useState('')

    /* 더보기 offset은 ref로 관리해 stale 클로저 경합 방지 */
    const offsetRef = useRef(0)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const loadLimit = initialLimit ?? LIMIT

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

    /* 목록 초기 로드 / 필터·검색 변경 시 */
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

    /* 더보기: loadingMore로 중복 클릭 차단, 함수형 업데이트로 경합 방지 */
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
        fetchIssues()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, statusFilter, searchQuery])

    return (
        <div className="space-y-4">
            {/* 검색창 */}
            {!hideSearch && (
                <SearchBar
                    value={searchInput}
                    onChange={handleSearchChange}
                    onSearch={handleSearch}
                />
            )}

            {/* 상태 탭 */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5 flex-1">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setStatusFilter(tab.value)}
                            className={[
                                'flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap',
                                statusFilter === tab.value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                            ].join(' ')}
                        >
                            {tab.icon && <span className="leading-none">{tab.icon}</span>}
                            <span>{showFullLabel ? tab.fullLabel : tab.label}</span>
                        </button>
                    ))}
                </div>
                <div className="hidden sm:flex shrink-0">
                    <Tooltip label="최신순" text="최신 등록순으로 정렬됩니다." />
                </div>
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 첫 로딩 */}
            {loading && issues.length === 0 && (
                <div className="text-center py-12 text-content-secondary text-sm">
                    로딩 중...
                </div>
            )}

            {/* 빈 목록 */}
            {!loading && issues.length === 0 && (
                <div className="text-center py-12 text-content-secondary text-sm">
                    이슈가 없습니다.
                </div>
            )}

            {/* 이슈 카드 리스트 */}
            {issues.length > 0 && (
                <div className="space-y-4">
                    {issues.map((issue) => (
                        <IssueCard key={issue.id} issue={issue} />
                    ))}
                </div>
            )}

            {/* 더 보기 */}
            {issues.length < total && (
                <div className="text-center pt-6">
                    <button
                        onClick={fetchMore}
                        disabled={loadingMore}
                        className="btn-neutral btn-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loadingMore ? '로딩 중...' : '더 보기'}
                    </button>
                </div>
            )}

            {/* 결과 개수 */}
            {issues.length > 0 && (
                <div className="text-center pt-2 text-xs text-content-muted">
                    {issues.length} / {total}
                </div>
            )}
        </div>
    )
}
