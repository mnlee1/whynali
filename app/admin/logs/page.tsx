'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface AdminLog {
    id: string
    action: string
    target_type: string
    target_id: string | null
    admin_id: string | null
    created_at: string
}

const TARGET_TYPE_LABELS: Record<string, string> = {
    discussion_topic: '토론 주제',
    safety_rule: '금칙어',
    comment: '댓글',
    vote: '투표',
}

const ACTION_BADGE: Record<string, string> = {
    '승인': 'bg-green-100 text-green-700',
    '반려': 'bg-red-100 text-red-700',
    '복구': 'bg-gray-100 text-gray-600',
    '종료': 'bg-gray-200 text-gray-700',
    '수정': 'bg-blue-100 text-blue-700',
    '삭제': 'bg-red-100 text-red-700',
    '금칙어 추가': 'bg-orange-100 text-orange-700',
    '금칙어 삭제': 'bg-red-100 text-red-700',
    '댓글 공개': 'bg-green-100 text-green-700',
    '댓글 삭제': 'bg-red-100 text-red-700',
    '투표 생성': 'bg-blue-100 text-blue-700',
    '투표 마감': 'bg-gray-200 text-gray-700',
    '투표 재개': 'bg-green-100 text-green-700',
    '투표 삭제': 'bg-red-100 text-red-700',
}

const PAGE_SIZE = 50

const MOCK_LOGS: AdminLog[] = [
    {
        id: 'mock-1',
        action: '승인',
        target_type: 'discussion_topic',
        target_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    {
        id: 'mock-2',
        action: '금칙어 추가',
        target_type: 'safety_rule',
        target_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
        id: 'mock-3',
        action: '댓글 공개',
        target_type: 'comment',
        target_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    },
    {
        id: 'mock-4',
        action: '반려',
        target_type: 'discussion_topic',
        target_id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
        id: 'mock-5',
        action: '투표 생성',
        target_type: 'vote',
        target_id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
        id: 'mock-6',
        action: '수정',
        target_type: 'discussion_topic',
        target_id: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
        id: 'mock-7',
        action: '댓글 삭제',
        target_type: 'comment',
        target_id: 'a7b8c9d0-e1f2-3456-abcd-567890123456',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
        id: 'mock-8',
        action: '종료',
        target_type: 'discussion_topic',
        target_id: 'b8c9d0e1-f2a3-4567-bcde-678901234567',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
    {
        id: 'mock-9',
        action: '금칙어 삭제',
        target_type: 'safety_rule',
        target_id: 'c9d0e1f2-a3b4-5678-cdef-789012345678',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
        id: 'mock-10',
        action: '투표 마감',
        target_type: 'vote',
        target_id: 'd0e1f2a3-b4c5-6789-defa-890123456789',
        admin_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    },
]

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

export default function AdminLogsPage() {
    const [logs, setLogs] = useState<AdminLog[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filterType, setFilterType] = useState('')
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    const loadLogs = useCallback(async (type: string, currentOffset: number, append: boolean) => {
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) })
            if (type) params.set('target_type', type)
            const res = await fetch(`/api/admin/logs?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setLogs((prev) => append ? [...prev, ...(json.data ?? [])] : (json.data ?? []))
            setTotal(json.total ?? 0)
            setLastRefreshedAt(new Date())
        } catch (e) {
            setError(e instanceof Error ? e.message : '로그 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [])

    useEffect(() => {
        setLoading(true)
        setOffset(0)
        loadLogs(filterType, 0, false)
    }, [filterType, loadLogs])

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadLogs(filterType, next, true)
    }

    const handleRefresh = () => {
        setLoading(true)
        setOffset(0)
        loadLogs(filterType, 0, false)
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
                        ← 관리자 홈
                    </Link>
                    <h1 className="text-2xl font-bold mt-1">운영 로그</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 대상 유형 필터 */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {[
                    { value: '', label: '전체' },
                    { value: 'discussion_topic', label: '토론 주제' },
                    { value: 'safety_rule', label: '금칙어' },
                    { value: 'comment', label: '댓글' },
                    { value: 'vote', label: '투표' },
                ].map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setFilterType(value)}
                        className={[
                            'px-3 py-1.5 text-sm rounded',
                            filterType === value
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto text-sm text-gray-500 self-center">
                    총 {total > 0 ? total.toLocaleString() : `${MOCK_LOGS.length} (예시)`}건
                </span>
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상 유형</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상 ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">관리자</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : (() => {
                            const isMock = logs.length === 0
                            const displayLogs = isMock ? MOCK_LOGS : logs
                            return (
                                <>
                                    {isMock && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                                <span className="text-xs text-gray-400">
                                                    아직 기록된 로그가 없습니다. 아래는 예시 데이터입니다.
                                                </span>
                                            </td>
                                        </tr>
                                    )}
                                    {displayLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className={[
                                                'hover:bg-gray-50',
                                                isMock ? 'opacity-60' : '',
                                            ].join(' ')}
                                        >
                                            <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                                {formatDate(log.created_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={[
                                                    'text-xs px-2 py-0.5 rounded font-medium',
                                                    ACTION_BADGE[log.action] ?? 'bg-gray-100 text-gray-600',
                                                ].join(' ')}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                                                {log.target_id ? `…${log.target_id.slice(-8)}` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400">
                                                {log.admin_id ? `…${log.admin_id.slice(-4)}` : '시스템'}
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            )
                        })()}
                    </tbody>
                </table>
            </div>

            {!loading && logs.length < total && (
                <div className="text-center mt-4">
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm px-5 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${total - logs.length}건 남음)`}
                    </button>
                </div>
            )}
        </div>
    )
}
