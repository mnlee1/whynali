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
    trigger_type: 'issue_created' | 'status_changed'
    created_at: string
}

type FilterStatus = '' | 'pending' | 'approved' | 'rejected'

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: 'pending', label: '대기' },
    { value: 'approved', label: '승인' },
    { value: 'rejected', label: '반려' },
    { value: '', label: '전체' },
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
        if (!window.confirm('이 숏폼의 이미지 카드를 생성하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/generate`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert('이미지 생성 완료!')
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : '이미지 생성 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleVideoUpload = async (id: string, file: File) => {
        setProcessingId(id)
        try {
            const formData = new FormData()
            formData.append('video', file)

            const res = await fetch(`/api/admin/shortform/${id}/upload-video`, {
                method: 'POST',
                body: formData,
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert('동영상 업로드 완료!')
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : '동영상 업로드 실패')
        } finally {
            setProcessingId(null)
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
                                                {job.video_path && (
                                                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                                                        영상 생성 완료
                                                    </span>
                                                )}
                                            </div>
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
                                            {job.approval_status === 'approved' && !job.video_path && (
                                                <button
                                                    onClick={() => handleGenerate(job.id)}
                                                    disabled={isProcessing}
                                                    className="text-xs px-2.5 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                                                >
                                                    이미지 생성
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
                                                                    <label className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer disabled:opacity-50 text-center">
                                                                        <input
                                                                            type="file"
                                                                            accept="video/mp4"
                                                                            className="hidden"
                                                                            disabled={isProcessing}
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0]
                                                                                if (file) handleVideoUpload(job.id, file)
                                                                            }}
                                                                        />
                                                                        동영상 업로드
                                                                    </label>
                                                                    <button
                                                                        onClick={() => handleYoutubeUpload(job.id)}
                                                                        disabled={isProcessing}
                                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                                                    >
                                                                        YouTube 업로드
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
        </div>
    )
}
