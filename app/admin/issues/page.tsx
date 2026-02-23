/**
 * app/admin/issues/page.tsx
 * 
 * [관리자 - 이슈 관리 페이지]
 * 
 * 이슈 승인·거부·수정·삭제 기능을 제공합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Issue } from '@/types/issue'

const MOCK_PENDING_ISSUES: Issue[] = [
    {
        id: 'mock-issue-1',
        title: '아이유 콘서트 티켓 암표 논란, 주최사 공식 입장 발표',
        description: '대규모 콘서트 티켓이 암표 사이트에서 수십 배 가격으로 거래되는 사례가 포착되었다.',
        status: '점화',
        category: '연예',
        heat_index: 87.4,
        approval_status: '대기',
        approved_at: null,
        created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
        id: 'mock-issue-2',
        title: '국회 예산안 처리 시한 임박, 여야 막판 협상 결렬',
        description: '정기국회 마지막 날 예산안을 둘러싼 여야 갈등이 심화되고 있다.',
        status: '논란중',
        category: '정치',
        heat_index: 72.1,
        approval_status: '대기',
        approved_at: null,
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
        id: 'mock-issue-3',
        title: '국내 AI 스타트업 시리즈 B 1000억 투자 유치',
        description: '국내 생성형 AI 스타트업이 글로벌 VC로부터 대규모 투자를 받아 주목받고 있다.',
        status: '점화',
        category: '기술',
        heat_index: 61.8,
        approval_status: '대기',
        approved_at: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
]

export default function AdminIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<string>('대기')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    useEffect(() => {
        fetchIssues()
    }, [filter])

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '승인': 1, '반려': 2 }

    const fetchIssues = async () => {
        try {
            setLoading(true)
            const url = filter
                ? `/api/admin/issues?approval_status=${filter}`
                : '/api/admin/issues'
            const response = await fetch(url)
            if (!response.ok) throw new Error('이슈 조회 실패')
            const data = await response.json()
            const list: Issue[] = data.data ?? []
            if (!filter) {
                list.sort((a, b) =>
                    (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9)
                )
            }
            setIssues(list)
            setLastRefreshedAt(new Date())
        } catch (err) {
            setError(err instanceof Error ? err.message : '오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (id: string) => {
        if (!confirm('이 이슈를 승인하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/approve`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('승인 실패')
            alert('승인되었습니다')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '승인 실패')
        }
    }

    const handleReject = async (id: string) => {
        if (!confirm('이 이슈를 거부하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/reject`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('거부 실패')
            alert('거부되었습니다')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '거부 실패')
        }
    }

    const handleRestore = async (id: string) => {
        if (!confirm('이 이슈를 대기 상태로 복구하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/restore`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('복구 실패')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '복구 실패')
        }
    }

    const handleHide = async (id: string) => {
        if (!confirm('승인된 이슈를 숨김 처리하시겠습니까?\n이슈가 목록에서 노출되지 않습니다.')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/hide`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('숨김 실패')
            fetchIssues()
        } catch (err) {
            alert(err instanceof Error ? err.message : '숨김 실패')
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const APPROVAL_DISPLAY: Record<string, string> = {
        '대기': '대기',
        '승인': '승인',
        '반려': '반려',
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case '승인':
                return 'bg-green-100 text-green-700'
            case '대기':
                return 'bg-yellow-100 text-yellow-700'
            case '반려':
                return 'bg-red-100 text-red-700'
            default:
                return 'bg-gray-100 text-gray-700'
        }
    }

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-gray-500">로딩 중...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-red-600">{error}</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
                        ← 관리자 홈
                    </Link>
                    <h1 className="text-3xl font-bold mt-1">이슈 관리</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchIssues}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 필터 */}
            <div className="flex gap-2 mb-6">
                {[
                    { value: '', label: '전체' },
                    { value: '대기', label: '대기' },
                    { value: '승인', label: '승인' },
                    { value: '반려', label: '반려' },
                ].map(({ value, label }) => (
                    <button
                        key={label}
                        onClick={() => setFilter(value)}
                        className={`px-4 py-2 rounded ${
                            filter === value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* 예시 데이터 안내 */}
            {issues.length === 0 && filter === '대기' && (
                <div className="mb-2">
                    <span className="text-xs px-2 py-1 bg-gray-100 border border-gray-200 rounded text-gray-500">
                        예시 데이터 (실제 대기 이슈 없음)
                    </span>
                </div>
            )}

            {/* 이슈 목록 */}
            <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                제목
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                상태
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                승인
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                화력
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성일
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {(issues.length > 0
                            ? issues
                            : filter === '대기' ? MOCK_PENDING_ISSUES : []
                        ).map((issue) => {
                            const isMock = issue.id.startsWith('mock-')
                            return (
                                <tr key={issue.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium">
                                        {isMock ? (
                                            <span className="text-gray-700">{issue.title}</span>
                                        ) : (
                                            <a
                                                href={`/issue/${issue.id}`}
                                                target="_blank"
                                                className="text-blue-600 hover:underline"
                                            >
                                                {issue.title}
                                            </a>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{issue.category}</td>
                                    <td className="px-4 py-3 text-sm">{issue.status}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 text-xs rounded ${getStatusColor(issue.approval_status)}`}>
                                            {APPROVAL_DISPLAY[issue.approval_status] ?? issue.approval_status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {issue.heat_index?.toFixed(1) || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {formatDate(issue.created_at)}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <div className="flex gap-2">
                                            {issue.approval_status === '대기' && (
                                                <>
                                                    <button
                                                        onClick={() => isMock ? alert('예시 데이터입니다. 실제 이슈에서 동작합니다.') : handleApprove(issue.id)}
                                                        className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        onClick={() => isMock ? alert('예시 데이터입니다. 실제 이슈에서 동작합니다.') : handleReject(issue.id)}
                                                        className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                                                    >
                                                        반려
                                                    </button>
                                                </>
                                            )}
                                            {issue.approval_status === '승인' && (
                                                <button
                                                    onClick={() => isMock ? alert('예시 데이터입니다.') : handleReject(issue.id)}
                                                    className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                                                >
                                                    반려
                                                </button>
                                            )}
                                            {issue.approval_status === '반려' && (
                                                <button
                                                    onClick={() => isMock ? alert('예시 데이터입니다.') : handleRestore(issue.id)}
                                                    className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                                >
                                                    복구
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {issues.length === 0 && filter !== '대기' && (
                <p className="text-center py-8 text-gray-500">이슈가 없습니다</p>
            )}
        </div>
    )
}
