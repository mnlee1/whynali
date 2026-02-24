'use client'

import { useState, useEffect, useCallback } from 'react'

interface AdminLog {
    id: string
    action: string
    target_type: string
    target_id: string | null
    admin_id: string | null
    details: string | null
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
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">운영 로그</h1>
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
                    총 {total.toLocaleString()}건
                </span>
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상 유형</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">내용</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상 ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">관리자</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-4 py-3">
                                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                                    기록된 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
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
                                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                        {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                                        {log.details ? (
                                            <span className="line-clamp-2">{log.details}</span>
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                                        {log.target_id ? `…${log.target_id.slice(-8)}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                                        {log.admin_id ? `…${log.admin_id.slice(-4)}` : '시스템'}
                                    </td>
                                </tr>
                            ))
                        )}
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
