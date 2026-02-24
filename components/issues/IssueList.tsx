/**
 * components/issues/IssueList.tsx
 * 
 * [이슈 목록 컴포넌트 - 검색/상태탭/정렬탭 + 카드 리스트]
 * 
 * 홈, 연예, 스포츠 등 모든 목록 화면에서 사용하는 메인 컴포넌트입니다.
 * 검색창, 상태 탭(전체/점화/논란중/종결), 정렬 탭(최신순/화력순), 이슈 카드 리스트, 더 보기 버튼을 포함합니다.
 * 
 * 사용 예시:
 *   <IssueList category="연예" />  // 연예 카테고리 목록
 *   <IssueList />                   // 전체 목록
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { getIssues } from '@/lib/api/issues'
import IssueCard from './IssueCard'
import type { Issue } from '@/types/issue'

interface IssueListProps {
    category?: string   // 카테고리 (연예, 스포츠 등). 없으면 전체 목록
}

// 상태 탭 목록
const STATUS_TABS = [
    { value: '', label: '전체' },
    { value: '점화', label: '점화' },
    { value: '논란중', label: '논란중' },
    { value: '종결', label: '종결' },
]

// 정렬 탭 목록
const SORT_TABS: { value: 'latest' | 'heat'; label: string }[] = [
    { value: 'latest', label: '최신순' },
    { value: 'heat', label: '화력순' },
]

const LIMIT = 20
const DEBOUNCE_MS = 350

export default function IssueList({ category }: IssueListProps) {
    const [issues, setIssues] = useState<Issue[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [searchInput, setSearchInput] = useState('')     // 입력 중인 값
    const [searchQuery, setSearchQuery] = useState('')     // 실제 API 호출 트리거 값
    const [statusFilter, setStatusFilter] = useState('')
    const [sortOption, setSortOption] = useState<'latest' | 'heat'>('latest')

    /* 더보기 offset은 ref로 관리해 stale 클로저 경합 방지 */
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
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
            setSearchQuery(searchInput)
        }
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
                sort: sortOption,
                limit: LIMIT,
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
                sort: sortOption,
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
    }, [category, statusFilter, sortOption, searchQuery])

    return (
        <div className="space-y-4">
            {/* 검색창 */}
            <input
                type="text"
                placeholder="이슈 검색..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none focus:border-neutral-400"
            />

            {/* 상태 탭 + 정렬 탭 */}
            <div className="flex items-center justify-between border-b border-neutral-200">
                {/* 상태 탭: 전체 / 점화 / 논란중 / 종결 */}
                <div className="flex">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setStatusFilter(tab.value)}
                            className={[
                                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                statusFilter === tab.value
                                    ? 'border-neutral-900 text-neutral-900'
                                    : 'border-transparent text-neutral-500 hover:text-neutral-700',
                            ].join(' ')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 정렬 탭: 최신순 / 화력순 */}
                <div className="flex gap-1 pb-2">
                    {SORT_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setSortOption(tab.value)}
                            className={[
                                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                                sortOption === tab.value
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
                            ].join(' ')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 첫 로딩 */}
            {loading && issues.length === 0 && (
                <div className="text-center py-12 text-neutral-500 text-sm">
                    로딩 중...
                </div>
            )}

            {/* 빈 목록 */}
            {!loading && issues.length === 0 && (
                <div className="text-center py-12 text-neutral-500 text-sm">
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
                        className="px-5 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loadingMore ? '로딩 중...' : '더 보기'}
                    </button>
                </div>
            )}

            {/* 결과 개수 */}
            {issues.length > 0 && (
                <div className="text-center pt-2 text-xs text-neutral-400">
                    {issues.length} / {total}
                </div>
            )}
        </div>
    )
}
