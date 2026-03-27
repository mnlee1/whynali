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
    issue: '이슈',
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
    '투표 승인': 'bg-green-100 text-green-700',
    '투표 반려': 'bg-red-100 text-red-700',
    '투표 수동 종료': 'bg-gray-200 text-gray-700',
    '투표 삭제': 'bg-red-100 text-red-700',
}

const PAGE_SIZE = 50

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
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
                    <h1 className="text-2xl font-bold text-content-primary">운영 로그</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-content-muted">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="btn-neutral btn-md"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 대상 유형 필터 */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {[
                    { value: '', label: '전체' },
                    { value: 'issue', label: '이슈' },
                    { value: 'vote', label: '투표' },
                    { value: 'discussion_topic', label: '토론 주제' },
                    { value: 'safety_rule', label: '금칙어' },
                    { value: 'comment', label: '댓글' },
                    
                ].map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setFilterType(value)}
                        className={[
                            'px-3 py-1.5 text-sm rounded-full border transition-colors',
                            filterType === value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto text-sm text-content-secondary self-center">
                    총 {total.toLocaleString()}건
                </span>
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">시간</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">액션</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">대상 유형</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">내용</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">대상 ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">관리자</th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-sm text-content-muted">
                                    기록된 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-surface-subtle">
                                    <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                        {formatDate(log.created_at)}
                                    </td>
                                    <td className="px-4 py-3 w-28 max-w-[7rem]">
                                        <span className={[
                                            'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block max-w-full truncate',
                                            ACTION_BADGE[log.action] ?? 'bg-surface-muted text-content-secondary',
                                        ].join(' ')} title={log.action}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                        {TARGET_TYPE_LABELS[log.target_type] ?? log.target_type}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-content-primary max-w-xs">
                                        {log.details ? (
                                            <span className="line-clamp-2">{log.details}</span>
                                        ) : (
                                            <span className="text-border-strong">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-content-muted font-mono whitespace-nowrap">
                                        {log.target_id ? `…${log.target_id.slice(-8)}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-content-secondary whitespace-nowrap">
                                        {log.admin_id ? log.admin_id.split('@')[0] : '시스템'}
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
                        className="btn-neutral btn-md"
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${total - logs.length}건 남음)`}
                    </button>
                </div>
            )}
        </div>
    )
}
