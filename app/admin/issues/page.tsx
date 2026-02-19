/**
 * app/admin/issues/page.tsx
 * 
 * [관리자 - 이슈 관리 페이지]
 * 
 * 이슈 승인·거부·수정·삭제 기능을 제공합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import type { Issue } from '@/types/issue'

export default function AdminIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<string>('대기')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchIssues()
    }, [filter])

    const fetchIssues = async () => {
        try {
            setLoading(true)
            const url = filter
                ? `/api/admin/issues?approval_status=${filter}`
                : '/api/admin/issues'
            const response = await fetch(url)
            if (!response.ok) throw new Error('이슈 조회 실패')
            const data = await response.json()
            setIssues(data.data)
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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case '승인':
                return 'bg-green-100 text-green-700'
            case '대기':
                return 'bg-yellow-100 text-yellow-700'
            case '거부':
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
                <h1 className="text-3xl font-bold">이슈 관리</h1>
                <button
                    onClick={fetchIssues}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    새로고침
                </button>
            </div>

            {/* 필터 */}
            <div className="flex gap-2 mb-6">
                {['전체', '대기', '승인', '거부'].map((status) => (
                    <button
                        key={status}
                        onClick={() => setFilter(status === '전체' ? '' : status)}
                        className={`px-4 py-2 rounded ${
                            (status === '전체' && filter === '') ||
                            (status !== '전체' && filter === status)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700'
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>

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
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">
                                    <a
                                        href={`/issue/${issue.id}`}
                                        target="_blank"
                                        className="text-blue-600 hover:underline"
                                    >
                                        {issue.title}
                                    </a>
                                </td>
                                <td className="px-4 py-3 text-sm">{issue.category}</td>
                                <td className="px-4 py-3 text-sm">{issue.status}</td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`px-2 py-1 text-xs rounded ${getStatusColor(
                                            issue.approval_status
                                        )}`}
                                    >
                                        {issue.approval_status}
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
                                                    onClick={() => handleApprove(issue.id)}
                                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                                >
                                                    승인
                                                </button>
                                                <button
                                                    onClick={() => handleReject(issue.id)}
                                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                                >
                                                    거부
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {issues.length === 0 && (
                <p className="text-center py-8 text-gray-500">이슈가 없습니다</p>
            )}
        </div>
    )
}
