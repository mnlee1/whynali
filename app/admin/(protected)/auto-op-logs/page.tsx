'use client'

import { useState, useEffect, useCallback } from 'react'

interface AutoOpLog {
    id: string
    job_type: string
    status: string
    target_type: string | null
    target_id: string | null
    details: Record<string, unknown> | null
    created_at: string
}

const JOB_TYPE_LABELS: Record<string, string> = {
    bot_comment: '봇 댓글',
    bot_comment_batch: '봇 배치',
}

const STATUS_BADGE: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
    success: '성공',
    failed: '실패',
    skipped: '스킵',
}

const PAGE_SIZE = 50

const JOB_FILTER_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'bot_comment', label: '봇 댓글' },
    { value: 'bot_comment_batch', label: '봇 배치' },
]

const STATUS_FILTER_OPTIONS = [
    { value: '', label: '전체' },
    { value: 'success', label: '성공' },
    { value: 'failed', label: '실패' },
    { value: 'skipped', label: '스킵' },
]

function formatDate(dateString: string): string {
    const d = new Date(dateString)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function DetailsCell({ details }: { details: Record<string, unknown> | null }) {
    if (!details) return <span className="text-content-muted">—</span>

    // bot_comment_batch: {processed, posted, scanned}
    if ('posted' in details) {
        return (
            <span className="text-sm text-content-secondary">
                스캔 {String(details.scanned ?? 0)}건 중 {String(details.processed ?? 0)}건 처리 → <span className="font-medium text-content-primary">{String(details.posted ?? 0)}개 등록</span>
            </span>
        )
    }
    // bot_comment: {persona, persona_type, issue_title, comment?, reason?}
    return (
        <span className="text-sm text-content-secondary">
            <span className="font-medium text-content-primary">{String(details.persona ?? '')}</span>
            {Boolean(details.persona_type) && <span className="text-xs text-content-muted ml-1">({String(details.persona_type)})</span>}
            {Boolean(details.issue_title) && (
                <span className="block text-xs text-content-muted truncate max-w-xs mt-0.5">
                    이슈: {String(details.issue_title)}
                </span>
            )}
            {Boolean(details.comment) && (
                <span className="block text-xs text-content-secondary truncate max-w-xs mt-0.5 italic">
                    &ldquo;{String(details.comment)}&rdquo;
                </span>
            )}
            {Boolean(details.reason) && (
                <span className="block text-xs text-red-500 mt-0.5">{String(details.reason)}</span>
            )}
        </span>
    )
}

export default function AutoOpLogsPage() {
    const [logs, setLogs] = useState<AutoOpLog[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [jobType, setJobType] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(true)

    const load = useCallback(async (jt: string, st: string, off: number) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
            if (jt) params.set('job_type', jt)
            if (st) params.set('status', st)
            const res = await fetch(`/api/admin/auto-op-logs?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setLogs(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch {
            setLogs([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load(jobType, status, offset)
    }, [load, jobType, status, offset])

    const handleFilter = (jt: string, st: string) => {
        setJobType(jt)
        setStatus(st)
        setOffset(0)
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">자동 운영 로그</h1>
                    <p className="text-sm text-content-muted mt-1">
                        크론·봇 등 자동화 작업 실행 내역. 총 <span className="font-medium text-content-primary">{total.toLocaleString()}</span>건
                    </p>
                </div>
                <button onClick={() => load(jobType, status, offset)} className="btn-neutral btn-sm">
                    새로고침
                </button>
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex gap-1.5">
                    {JOB_FILTER_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => handleFilter(opt.value, status)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                jobType === opt.value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface border-border text-content-secondary hover:bg-surface-subtle'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => handleFilter(jobType, opt.value)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                status === opt.value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface border-border text-content-secondary hover:bg-surface-subtle'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="w-40 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">시간</th>
                            <th className="w-28 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">작업</th>
                            <th className="w-20 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">상태</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">상세</th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3, 4, 5].map((i) => (
                                <tr key={i}>
                                    <td colSpan={4} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-12 text-center text-sm text-content-muted">
                                    로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-surface-subtle">
                                    <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                        {formatDate(log.created_at)}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-content-primary whitespace-nowrap">
                                        {JOB_TYPE_LABELS[log.job_type] ?? log.job_type}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[log.status] ?? 'bg-surface-muted text-content-secondary'}`}>
                                            {STATUS_LABELS[log.status] ?? log.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-md">
                                        <DetailsCell details={log.details} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-content-muted">
                        {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total.toLocaleString()}건
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            disabled={offset === 0}
                            className="btn-neutral btn-sm disabled:opacity-40"
                        >
                            이전
                        </button>
                        <span className="flex items-center text-sm text-content-secondary px-2">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                            disabled={offset + PAGE_SIZE >= total}
                            className="btn-neutral btn-sm disabled:opacity-40"
                        >
                            다음
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
