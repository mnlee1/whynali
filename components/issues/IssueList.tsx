/**
 * components/issues/IssueList.tsx
 * 
 * [이슈 목록 컴포넌트 - 검색/필터/정렬 + 카드 리스트]
 * 
 * 홈, 연예, 스포츠 등 모든 목록 화면에서 사용하는 메인 컴포넌트입니다.
 * 검색창, 상태 필터, 정렬 옵션, 이슈 카드 리스트, 더 보기 버튼을 포함합니다.
 * 
 * 사용 예시:
 *   <IssueList category="연예" />  // 연예 카테고리 목록
 *   <IssueList />                   // 전체 목록
 */

'use client'

import { useState, useEffect } from 'react'
import { getIssues } from '@/lib/api/issues'
import IssueCard from './IssueCard'
import type { Issue } from '@/types/issue'

interface IssueListProps {
    category?: string   // 카테고리 (연예, 스포츠 등). 없으면 전체 목록
}

export default function IssueList({ category }: IssueListProps) {
    // 상태 관리
    const [issues, setIssues] = useState<Issue[]>([])      // 이슈 목록
    const [total, setTotal] = useState(0)                  // 전체 개수
    const [loading, setLoading] = useState(true)           // 로딩 중
    const [error, setError] = useState<string | null>(null) // 에러 메시지
    
    // 필터/검색/정렬 상태
    const [searchQuery, setSearchQuery] = useState('')     // 검색 키워드
    const [statusFilter, setStatusFilter] = useState('')   // 상태 필터 (점화/논란중/종결)
    const [sortOption, setSortOption] = useState<'latest' | 'heat'>('latest') // 정렬
    const [offset, setOffset] = useState(0)                // 페이지네이션 오프셋

    const LIMIT = 20 // 한 번에 가져올 개수

    // 이슈 목록 불러오기
    const fetchIssues = async (reset = false) => {
        try {
            setLoading(true)
            setError(null)

            const params = {
                category,
                status: statusFilter || undefined,
                q: searchQuery || undefined,
                sort: sortOption,
                limit: LIMIT,
                offset: reset ? 0 : offset,
            }

            const response = await getIssues(params)

            if (reset) {
                setIssues(response.data)    // 처음부터 (검색/필터 변경 시)
                setOffset(LIMIT)
            } else {
                setIssues([...issues, ...response.data]) // 더 보기
                setOffset(offset + LIMIT)
            }

            setTotal(response.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : '목록 조회 실패')
        } finally {
            setLoading(false)
        }
    }

    // 첫 로딩 & 필터/정렬 변경 시
    useEffect(() => {
        setOffset(0)
        fetchIssues(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, statusFilter, sortOption, searchQuery])

    // 검색 입력 핸들러 (Enter 키)
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setOffset(0)
            fetchIssues(true)
        }
    }

    return (
        <div className="space-y-4">
            {/* 검색 & 필터 영역 */}
            <div className="flex flex-col md:flex-row gap-3">
                {/* 검색창 */}
                <input
                    type="text"
                    placeholder="이슈 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="flex-1 px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* 상태 필터 */}
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">전체 상태</option>
                    <option value="점화">점화</option>
                    <option value="논란중">논란중</option>
                    <option value="종결">종결</option>
                </select>

                {/* 정렬 */}
                <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as 'latest' | 'heat')}
                    className="px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="latest">최신순</option>
                    <option value="heat">화력순</option>
                </select>
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    {error}
                </div>
            )}

            {/* 로딩 (첫 로딩만) */}
            {loading && issues.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    로딩 중...
                </div>
            )}

            {/* 빈 목록 */}
            {!loading && issues.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    이슈가 없습니다.
                </div>
            )}

            {/* 이슈 카드 리스트 */}
            {issues.length > 0 && (
                <div className="space-y-3">
                    {issues.map((issue) => (
                        <IssueCard key={issue.id} issue={issue} />
                    ))}
                </div>
            )}

            {/* 더 보기 버튼 */}
            {issues.length < total && (
                <div className="text-center pt-4">
                    <button
                        onClick={() => fetchIssues(false)}
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {loading ? '로딩 중...' : '더 보기'}
                    </button>
                </div>
            )}

            {/* 결과 개수 표시 */}
            {issues.length > 0 && (
                <div className="text-center text-sm text-gray-500">
                    {issues.length} / {total}
                </div>
            )}
        </div>
    )
}
