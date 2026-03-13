'use client'

import { useState, useEffect, useCallback } from 'react'

type ReportStatus = '대기' | '처리완료' | '무시'

interface Report {
    id: string
    comment_id: string
    reason: string
    status: ReportStatus
    created_at: string
    comment_body: string | null
    issue_id: string | null
    discussion_topic_id: string | null
    report_count: number
}

const STATUS_OPTIONS = [
    { value: '대기', label: '대기' },
    { value: '처리완료', label: '처리완료' },
    { value: '무시', label: '무시' },
]

const STATUS_BADGE: Record<ReportStatus, string> = {
    대기: 'bg-yellow-100 text-yellow-700',
    처리완료: 'bg-green-100 text-green-700',
    무시: 'bg-gray-100 text-gray-500',
}

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}`
}

function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + '…' : text
}

export default function AdminReportsPage() {
    const [reports, setReports] = useState<Report[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('대기')
    const [updatingId, setUpdatingId] = useState<string | null>(null)

    const loadReports = useCallback(async (status: string) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/admin/reports?status=${status}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? '조회 실패')
            setReports(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadReports(statusFilter)
    }, [loadReports, statusFilter])

    const handleAction = async (reportId: string, action: '처리완료' | '무시') => {
        setUpdatingId(reportId)
        try {
            const res = await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            if (!res.ok) throw new Error('처리 실패')
            setReports((prev) =>
                prev.map((r) => r.id === reportId ? { ...r, status: action } : r)
            )
        } catch (e) {
            alert(e instanceof Error ? e.message : '오류가 발생했습니다.')
        } finally {
            setUpdatingId(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">신고 관리</h1>
                    <p className="text-sm text-gray-500 mt-1">사용자가 신고한 댓글을 검토하고 처리합니다.</p>
                </div>
                <button
                    onClick={() => loadReports(statusFilter)}
                    className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    새로고침
                </button>
            </div>

            {/* 상태 필터 */}
            <div className="flex items-center gap-2">
                {STATUS_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={[
                            'text-sm px-4 py-1.5 rounded-lg border transition-colors',
                            statusFilter === opt.value
                                ? 'border-gray-800 bg-gray-800 text-white'
                                : 'border-gray-200 text-gray-600 hover:border-gray-400',
                        ].join(' ')}
                    >
                        {opt.label}
                    </button>
                ))}
                <span className="ml-auto text-sm text-gray-500">총 {total}건</span>
            </div>

            {/* 목록 */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <p className="text-sm text-red-500">{error}</p>
            ) : reports.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                    해당 상태의 신고가 없습니다.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">신고 사유</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">댓글 내용</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">출처</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">신고수</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">신고일</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">처리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reports.map((report) => (
                                <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <span className="inline-block px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 font-medium">
                                            {report.reason}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                        <p className="text-gray-700 text-xs leading-relaxed">
                                            {report.comment_body
                                                ? truncate(report.comment_body, 80)
                                                : <span className="text-gray-400 italic">댓글 삭제됨</span>
                                            }
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                        {report.issue_id
                                            ? <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">이슈</span>
                                            : report.discussion_topic_id
                                                ? <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">토론</span>
                                                : '-'
                                        }
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600 text-center">
                                        {report.report_count > 1
                                            ? <span className="font-semibold text-red-600">{report.report_count}</span>
                                            : report.report_count
                                        }
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                                        {formatDate(report.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${STATUS_BADGE[report.status]}`}>
                                            {report.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {report.status === '대기' && (
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => handleAction(report.id, '처리완료')}
                                                    disabled={updatingId === report.id}
                                                    className="text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                >
                                                    처리완료
                                                </button>
                                                <button
                                                    onClick={() => handleAction(report.id, '무시')}
                                                    disabled={updatingId === report.id}
                                                    className="text-xs px-2.5 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                                >
                                                    무시
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
