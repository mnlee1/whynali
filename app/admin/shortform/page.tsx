'use client'

/**
 * app/admin/shortform/page.tsx
 * 
 * [관리자 - 숏폼 job 관리 페이지]
 * 
 * 이슈 승인 시, 이슈 상태 전환 시 자동 생성된 숏폼 job을 관리합니다.
 * 승인된 job은 영상 생성 후 플랫폼 업로드 대상이 됩니다.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface AiValidation {
    status: 'passed' | 'flagged'
    reason: string
    checked_at: string
}

interface ShortformJob {
    id: string
    issue_id: string
    issue_title: string
    issue_status: string
    heat_grade: string
    source_count: { news: number; community: number }
    issue_url: string
    video_path: string | null
    approval_status: 'pending' | 'approved' | 'rejected'
    upload_status: Record<string, string> | null
    ai_validation: AiValidation | null
    trigger_type: 'issue_created' | 'status_changed' | 'daily_batch'
    created_at: string
}

type FilterStatus = '' | 'pending' | 'approved' | 'rejected'

interface ManualCreateModal {
    open: boolean
    issueId: string
    loading: boolean
    error: string | null
}

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: 'pending', label: '대기' },
    { value: 'approved', label: '승인' },
    { value: 'rejected', label: '반려' },
]

const APPROVAL_STATUS_STYLE: Record<string, string> = {
    'pending': 'bg-yellow-100 text-yellow-700',
    'approved': 'bg-green-100 text-green-700',
    'rejected': 'bg-red-100 text-red-700',
}

const HEAT_GRADE_STYLE: Record<string, string> = {
    '높음': 'bg-red-100 text-red-700',
    '보통': 'bg-yellow-100 text-yellow-700',
    '낮음': 'bg-gray-100 text-gray-600',
}

const TRIGGER_TYPE_LABEL: Record<string, string> = {
    'issue_created': '이슈 승인',
    'status_changed': '상태 전환',
    'daily_batch': '일일 배치',
}

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

function getStoragePublicUrl(path: string): string {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${base}/storage/v1/object/public/shortform/${path}`
}

const PAGE_SIZE = 20

export default function AdminShortformPage() {
    const [jobs, setJobs] = useState<ShortformJob[]>([])
    const [total, setTotal] = useState(0)
    const [filter, setFilter] = useState<FilterStatus>('pending')
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [previewJob, setPreviewJob] = useState<ShortformJob | null>(null)
    const [manualCreate, setManualCreate] = useState<ManualCreateModal>({
        open: false,
        issueId: '',
        loading: false,
        error: null,
    })

    const loadJobs = useCallback(async (status: FilterStatus, targetPage: number = 1) => {
        setLoading(true)
        setError(null)
        try {
            const offset = (targetPage - 1) * PAGE_SIZE
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offset),
            })

            if (status) {
                params.set('approval_status', status)
            }

            const res = await fetch(`/api/admin/shortform?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            setJobs(json.data ?? [])
            setTotal(json.total ?? 0)
            setLastRefreshedAt(new Date())
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        setPage(1)
        loadJobs(filter, 1)
    }, [filter, loadJobs])

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        const confirmMsg = action === 'approve'
            ? '이 숏폼 job을 승인하시겠습니까? 영상 생성 대상이 됩니다.'
            : '이 숏폼 job을 반려하시겠습니까?'

        if (!window.confirm(confirmMsg)) return

        setProcessingId(id)
        try {
            const endpoint = `/api/admin/shortform/${id}/${action}`
            const res = await fetch(endpoint, { method: 'PATCH' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleGenerate = async (id: string) => {
        if (!window.confirm('이 숏폼의 동영상을 생성하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/generate`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert('동영상 생성 완료!')
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : '동영상 생성 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleAiValidate = async (id: string) => {
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/ai-validate`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'AI 판별 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleManualCreate = async () => {
        const { issueId } = manualCreate
        if (!issueId.trim()) {
            setManualCreate((prev) => ({ ...prev, error: 'Issue ID를 입력해 주세요' }))
            return
        }

        setManualCreate((prev) => ({ ...prev, loading: true, error: null }))
        try {
            const res = await fetch('/api/admin/shortform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issueId: issueId.trim(), triggerType: 'issue_created' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            setManualCreate({ open: false, issueId: '', loading: false, error: null })
            setFilter('pending')
            await loadJobs('pending', 1)
        } catch (e) {
            setManualCreate((prev) => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : 'Job 생성 실패',
            }))
        }
    }

    const handleYoutubeUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 YouTube Shorts에 업로드하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-youtube`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`YouTube 업로드 완료!\n${json.url}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'YouTube 업로드 실패')
        } finally {
            setProcessingId(null)
        }
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">숏폼 관리</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        이슈 승인/상태 전환 시 자동 생성된 숏폼 job 목록
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => setManualCreate({ open: true, issueId: '', loading: false, error: null })}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        수동 생성
                    </button>
                    <button
                        onClick={() => loadJobs(filter, page)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 필터 탭 */}
            <div className="flex gap-2 mb-4">
                {FILTER_LABELS.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={[
                            'px-4 py-1.5 text-sm rounded',
                            filter === value
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                        ].join(' ')}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Job 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                이슈 정보
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                화력/출처
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                트리거
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                상태
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성일
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-4 py-3">
                                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : jobs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                                    해당 상태의 숏폼 job이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            jobs.map((job) => {
                                const isProcessing = processingId === job.id
                                return (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm">
                                            <Link
                                                href={`/issue/${job.issue_id}`}
                                                target="_blank"
                                                className="text-blue-600 hover:underline font-medium block mb-1"
                                            >
                                                {job.issue_title}
                                            </Link>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-2 py-0.5 rounded ${
                                                    job.issue_status === '점화' ? 'bg-orange-100 text-orange-700' :
                                                    job.issue_status === '논란중' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {job.issue_status}
                                                </span>
                                            </div>
                                            {job.video_path && (
                                                <div className="mt-2 flex items-start gap-2">
                                                    <button
                                                        onClick={() => setPreviewJob(job)}
                                                        className="relative w-14 h-24 rounded border border-gray-200 overflow-hidden group flex-shrink-0"
                                                    >
                                                        <video
                                                            src={getStoragePublicUrl(job.video_path)}
                                                            className="w-full h-full object-cover"
                                                            preload="metadata"
                                                            muted
                                                        />
                                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                                                            </svg>
                                                        </div>
                                                    </button>
                                                    <div className="flex flex-col gap-1">
                                                        {job.ai_validation ? (
                                                            <span
                                                                title={job.ai_validation.reason}
                                                                className={`text-xs px-2 py-0.5 rounded cursor-help ${
                                                                    job.ai_validation.status === 'passed'
                                                                        ? 'bg-green-100 text-green-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                }`}
                                                            >
                                                                AI {job.ai_validation.status === 'passed' ? '적합' : '주의'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400">
                                                                AI 판별 전
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`inline-block px-2 py-1 text-xs rounded mb-1 ${HEAT_GRADE_STYLE[job.heat_grade]}`}>
                                                화력 {job.heat_grade}
                                            </span>
                                            <div className="text-xs text-gray-500">
                                                뉴스 {job.source_count.news}건 / 커뮤니티 {job.source_count.community}건
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                                                {TRIGGER_TYPE_LABEL[job.trigger_type]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs rounded ${APPROVAL_STATUS_STYLE[job.approval_status]}`}>
                                                {job.approval_status === 'pending' ? '대기' :
                                                 job.approval_status === 'approved' ? '승인' : '반려'}
                                            </span>
                                            {job.upload_status && (
                                                <div className="mt-1 text-xs text-gray-500">
                                                    {Object.entries(job.upload_status).map(([platform, statusObj]) => {
                                                        const status = typeof statusObj === 'object' && statusObj !== null
                                                            ? (statusObj as any).status || 'unknown'
                                                            : String(statusObj)
                                                        return (
                                                            <div key={platform}>
                                                                {platform}: {status}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {formatDate(job.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {job.approval_status === 'pending' && (
                                                <div className="flex flex-col gap-1.5">
                                                    {/* 동영상 생성 — video_path 없을 때 */}
                                                    {!job.video_path && (
                                                        <button
                                                            onClick={() => handleGenerate(job.id)}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                                                        >
                                                            동영상 생성
                                                        </button>
                                                    )}
                                                    {/* 동영상 있으면 승인/반려 */}
                                                    {job.video_path && (
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                onClick={() => handleAction(job.id, 'approve')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(job.id, 'reject')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                            >
                                                                반려
                                                            </button>
                                                        </div>
                                                    )}
                                                    {/* AI 재판별 */}
                                                    {job.video_path && (
                                                        <button
                                                            onClick={() => handleAiValidate(job.id)}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                                                        >
                                                            AI 재판별
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {job.approval_status === 'approved' && !job.video_path && (
                                                <button
                                                    onClick={() => handleGenerate(job.id)}
                                                    disabled={isProcessing}
                                                    className="text-xs px-2.5 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                                                >
                                                    동영상 생성
                                                </button>
                                            )}
                                            {job.approval_status === 'approved' && job.video_path && (
                                                (() => {
                                                    const youtubeStatus = (job.upload_status as any)?.youtube?.status
                                                    const youtubeUrl = (job.upload_status as any)?.youtube?.url
                                                    const isYoutubeUploaded = youtubeStatus === 'success'

                                                    return (
                                                        <div className="flex flex-col gap-1.5">
                                                            {!isYoutubeUploaded && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleYoutubeUpload(job.id)}
                                                                        disabled={isProcessing}
                                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                                    >
                                                                        YouTube 업로드
                                                                    </button>
                                                                    <button
                                                                        disabled
                                                                        title="Instagram 연동 준비 중"
                                                                        className="text-xs px-2.5 py-1.5 bg-pink-100 text-pink-400 rounded cursor-not-allowed opacity-60"
                                                                    >
                                                                        Instagram
                                                                    </button>
                                                                    <button
                                                                        disabled
                                                                        title="TikTok 연동 준비 중"
                                                                        className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-400 rounded cursor-not-allowed opacity-60"
                                                                    >
                                                                        TikTok
                                                                    </button>
                                                                </>
                                                            )}
                                                            {isYoutubeUploaded && (
                                                                <a
                                                                    href={youtubeUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-center"
                                                                >
                                                                    YouTube 완료
                                                                </a>
                                                            )}
                                                        </div>
                                                    )
                                                })()
                                            )}
                                            {job.approval_status === 'rejected' && (
                                                <span className="text-xs text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            {total > 0 && (
                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-500">
                        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / 총 {total}개
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setPage(1); loadJobs(filter, 1) }}
                            disabled={page === 1 || loading}
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            «
                        </button>
                        <button
                            onClick={() => { setPage(page - 1); loadJobs(filter, page - 1) }}
                            disabled={page === 1 || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            이전
                        </button>
                        <span className="px-3 py-1.5 text-sm font-medium text-gray-700">
                            {page} / {Math.ceil(total / PAGE_SIZE)}
                        </span>
                        <button
                            onClick={() => { setPage(page + 1); loadJobs(filter, page + 1) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            다음
                        </button>
                        <button
                            onClick={() => { const last = Math.ceil(total / PAGE_SIZE); setPage(last); loadJobs(filter, last) }}
                            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* 수동 job 생성 모달 */}
            {manualCreate.open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => !manualCreate.loading && setManualCreate({ open: false, issueId: '', loading: false, error: null })}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold mb-1">수동 숏폼 Job 생성</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            이슈 ID를 입력하면 화력 필터·쿨다운 없이 job을 생성합니다.
                        </p>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Issue ID
                        </label>
                        <input
                            type="text"
                            value={manualCreate.issueId}
                            onChange={(e) => setManualCreate((prev) => ({ ...prev, issueId: e.target.value, error: null }))}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualCreate()}
                            placeholder="예: 550e8400-e29b-41d4-a716-446655440000"
                            disabled={manualCreate.loading}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                        />
                        {manualCreate.error && (
                            <p className="mt-2 text-sm text-red-600">{manualCreate.error}</p>
                        )}
                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                onClick={() => setManualCreate({ open: false, issueId: '', loading: false, error: null })}
                                disabled={manualCreate.loading}
                                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleManualCreate}
                                disabled={manualCreate.loading || !manualCreate.issueId.trim()}
                                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                            >
                                {manualCreate.loading ? '생성 중...' : 'Job 생성'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 동영상 미리보기 모달 */}
            {previewJob && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => setPreviewJob(null)}
                >
                    <div
                        className="relative bg-black rounded-xl overflow-hidden shadow-2xl"
                        style={{ width: 360, height: 640 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewJob(null)}
                            className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80"
                        >
                            ✕
                        </button>

                        <video
                            src={getStoragePublicUrl(previewJob.video_path!)}
                            className="w-full h-full object-contain"
                            controls
                            autoPlay
                            loop
                            playsInline
                        />

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
                            <p className="text-white text-sm font-medium line-clamp-2">
                                {previewJob.issue_title}
                            </p>
                            <a
                                href={previewJob.issue_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-300 text-xs mt-1 block hover:underline"
                                onClick={(e) => e.stopPropagation()}
                            >
                                이슈 상세 보기 →
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
