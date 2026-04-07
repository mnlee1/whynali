'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminPagination from '@/components/admin/AdminPagination'

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
    report: '신고',
}

const ACTION_BADGE: Record<string, string> = {
    '승인': 'bg-green-100 text-green-700',
    '반려': 'bg-red-100 text-red-700',
    '복구': 'bg-gray-100 text-gray-600',
    '종료': 'bg-gray-200 text-gray-700',
    '수정': 'bg-blue-100 text-blue-700',
    '삭제': 'bg-red-100 text-red-700',
    '금칙어 추가': 'bg-orange-100 text-orange-700',
    '금칙어 제외 처리': 'bg-orange-100 text-orange-700',
    '금칙어 복원': 'bg-blue-100 text-blue-700',
    '금칙어 삭제': 'bg-red-100 text-red-700',
    '댓글 공개': 'bg-green-100 text-green-700',
    '댓글 삭제': 'bg-red-100 text-red-700',
    '투표 생성': 'bg-blue-100 text-blue-700',
    '투표 승인': 'bg-green-100 text-green-700',
    '투표 반려': 'bg-red-100 text-red-700',
    '투표 수동 종료': 'bg-gray-200 text-gray-700',
    '투표 삭제': 'bg-red-100 text-red-700',
    '신고 처리완료': 'bg-red-100 text-red-700',
    '신고 무시': 'bg-gray-100 text-gray-600',
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
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filterType, setFilterType] = useState('')
    const [actionTooltip, setActionTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

    const loadLogs = useCallback(async (type: string, targetPage: number) => {
        try {
            setLoading(true)
            const offset = (targetPage - 1) * PAGE_SIZE
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
            if (type) params.set('target_type', type)
            const res = await fetch(`/api/admin/logs?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setLogs(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '로그 조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        setPage(1)
        loadLogs(filterType, 1)
    }, [filterType, loadLogs])

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-content-primary">운영 로그</h1>
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
                    { value: 'report', label: '신고' },
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
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">시간</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">액션</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">대상 유형</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">내용</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">관리자</th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-content-muted">
                                    기록된 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-surface-subtle">
                                    <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                        {formatDate(log.created_at)}
                                    </td>
                                    <td className="px-4 py-3 w-44 max-w-[11rem]">
                                        <span
                                            className={[
                                                'text-xs px-2 py-0.5 rounded-full font-medium inline-block max-w-full truncate cursor-default',
                                                ACTION_BADGE[log.action] ?? 'bg-surface-muted text-content-secondary',
                                            ].join(' ')}
                                            onMouseEnter={(e) => {
                                                const el = e.currentTarget
                                                if (el.scrollWidth > el.clientWidth) {
                                                    const rect = el.getBoundingClientRect()
                                                    setActionTooltip({
                                                        text: log.action,
                                                        x: rect.left + rect.width / 2,
                                                        y: rect.top - 6,
                                                    })
                                                }
                                            }}
                                            onMouseLeave={() => setActionTooltip(null)}
                                        >
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
                                    <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                        {log.admin_id ? log.admin_id.split('@')[0] : '시스템'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <AdminPagination
                page={page}
                totalPages={Math.ceil(total / PAGE_SIZE)}
                total={total}
                pageSize={PAGE_SIZE}
                disabled={loading}
                onChange={(p) => { setPage(p); loadLogs(filterType, p) }}
            />

            {actionTooltip && (
                <div
                    className="fixed z-50 px-2 py-1 text-xs text-white bg-gray-800 rounded pointer-events-none -translate-x-1/2 -translate-y-full max-w-[14rem] break-keep leading-relaxed"
                    style={{ left: actionTooltip.x, top: actionTooltip.y }}
                >
                    {actionTooltip.text}
                </div>
            )}
        </div>
    )
}
