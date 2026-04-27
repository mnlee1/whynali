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
import AdminPagination from '@/components/admin/AdminPagination'
import AdminTabFilter from '@/components/admin/AdminTabFilter'

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
    trigger_type: 'issue_created' | 'status_changed' | 'daily_batch'
    created_at: string
}

interface IssueOption {
    id: string
    title: string
    approval_status: string
    heat_index: number | null
}

type FilterStatus = '' | 'pending' | 'approved' | 'rejected'

interface ImagePreviewModal {
    open: boolean
    jobId: string
    jobTitle: string
    images: string[]
    loading: boolean
    generating: boolean
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
    const [uploadingAction, setUploadingAction] = useState<'youtube' | 'tiktok' | 'instagram' | 'all' | null>(null)

    const [previewJob, setPreviewJob] = useState<ShortformJob | null>(null)
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
    const [imagePreview, setImagePreview] = useState<ImagePreviewModal>({
        open: false,
        jobId: '',
        jobTitle: '',
        images: [],
        loading: false,
        generating: false,
        error: null,
    })

    // 수동 생성 인라인 영역
    const [manualCreateOpen, setManualCreateOpen] = useState(false)
    const [selectedIssueId, setSelectedIssueId] = useState('')
    const [manualCreateLoading, setManualCreateLoading] = useState(false)
    const [manualCreateError, setManualCreateError] = useState<string | null>(null)
    const [issueOptions, setIssueOptions] = useState<IssueOption[]>([])
    const [issueOptionsLoading, setIssueOptionsLoading] = useState(false)

    const loadTabCounts = useCallback(async () => {
        const tabParams: { value: FilterStatus; params: Record<string, string> }[] = [
            { value: '', params: {} },
            { value: 'pending', params: { approval_status: 'pending' } },
            { value: 'approved', params: { approval_status: 'approved' } },
            { value: 'rejected', params: { approval_status: 'rejected' } },
        ]
        try {
            const results = await Promise.all(
                tabParams.map(({ params }) => {
                    const p = new URLSearchParams({ limit: '1', offset: '0', ...params })
                    return fetch(`/api/admin/shortform?${p}`).then(r => r.ok ? r.json() : null)
                })
            )
            const counts: Record<string, number> = {}
            tabParams.forEach(({ value }, i) => {
                counts[value] = results[i]?.total ?? 0
            })
            setTabCounts(counts)
        } catch {
            // 카운트 로드 실패 시 무시
        }
    }, [])

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
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    const loadIssueOptions = useCallback(async () => {
        setIssueOptionsLoading(true)
        try {
            // 승인된 이슈 목록을 화력순으로 가져옴 (실서버/테스트서버 공통)
            const params = new URLSearchParams({
                approval_status: '승인',
                limit: '100',
                offset: '0',
            })
            const res = await fetch(`/api/admin/issues?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setIssueOptions(json.data ?? [])
        } catch {
            setIssueOptions([])
        } finally {
            setIssueOptionsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTabCounts()
    }, [loadTabCounts])

    useEffect(() => {
        setPage(1)
        loadJobs(filter, 1)
    }, [filter, loadJobs])

    const handleToggleManualCreate = () => {
        if (!manualCreateOpen) {
            setManualCreateOpen(true)
            setSelectedIssueId('')
            setManualCreateError(null)
            loadIssueOptions()
        } else {
            setManualCreateOpen(false)
        }
    }

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

            const nextFilter = action === 'approve' ? 'approved' : 'rejected'
            setFilter(nextFilter)
            await loadTabCounts()
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleGenerate = async (id: string, images?: string[]) => {
        if (!window.confirm('이 숏폼의 동영상을 생성하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ images: images ?? [] }),
            })
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

    const fetchPreviewImages = async (jobId: string, seed?: number) => {
        setImagePreview((prev) => ({ ...prev, loading: true, error: null, images: [] }))
        try {
            const url = seed !== undefined
                ? `/api/admin/shortform/${jobId}/preview-images?seed=${seed}`
                : `/api/admin/shortform/${jobId}/preview-images`
            const res = await fetch(url)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setImagePreview((prev) => ({ ...prev, loading: false, images: json.images ?? [] }))
        } catch (e) {
            setImagePreview((prev) => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : '이미지 조회 실패',
            }))
        }
    }

    const handlePreviewImages = async (job: ShortformJob) => {
        setImagePreview({ open: true, jobId: job.id, jobTitle: job.issue_title, images: [], loading: true, generating: false, error: null })
        await fetchPreviewImages(job.id)
    }

    const handleRefreshImages = () => {
        fetchPreviewImages(imagePreview.jobId, Math.floor(Math.random() * 1000))
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 숏폼 job을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await Promise.all([loadJobs(filter, page), loadTabCounts()])
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setProcessingId(null)
        }
    }


    const handleManualCreate = async () => {
        if (!selectedIssueId) {
            setManualCreateError('이슈를 선택해 주세요')
            return
        }

        setManualCreateLoading(true)
        setManualCreateError(null)
        try {
            const res = await fetch('/api/admin/shortform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issueId: selectedIssueId, triggerType: 'issue_created' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            setManualCreateOpen(false)
            setSelectedIssueId('')
            setFilter('pending')
            await Promise.all([loadJobs('pending', 1), loadTabCounts()])
        } catch (e) {
            setManualCreateError(e instanceof Error ? e.message : 'Job 생성 실패')
        } finally {
            setManualCreateLoading(false)
        }
    }

    const handleAllUpload = async (id: string, targets: { youtube: boolean; tiktok: boolean; instagram: boolean }) => {
        const platforms = [
            targets.youtube && 'YouTube',
            targets.tiktok && 'TikTok',
            targets.instagram && 'Instagram',
        ].filter(Boolean).join(', ')

        if (!window.confirm(`${platforms}에 한번에 업로드하시겠습니까?`)) return

        setProcessingId(id)
        setUploadingAction('all')
        const results: string[] = []
        const errors: string[] = []

        try {
            if (targets.youtube) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-youtube`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`YouTube ✓`)
                } catch (e) {
                    errors.push(`YouTube 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            if (targets.tiktok) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-tiktok`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`TikTok ✓`)
                } catch (e) {
                    errors.push(`TikTok 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            if (targets.instagram) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-instagram`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`Instagram ✓`)
                } catch (e) {
                    errors.push(`Instagram 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            const lines = [...results, ...errors]
            if (errors.length > 0) lines.push('\n실패한 매체는 개별 업로드 버튼으로 재시도하세요.')
            alert(lines.join('\n'))
            await loadJobs(filter, page)
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleYoutubeUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 YouTube Shorts에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('youtube')
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
            setUploadingAction(null)
        }
    }

    const handleUnapprove = async (id: string) => {
        if (!window.confirm('승인을 취소하고 대기 상태로 되돌리겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/unapprove`, { method: 'PATCH' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setFilter('pending')
            await loadTabCounts()
        } catch (e) {
            alert(e instanceof Error ? e.message : '승인 취소 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleTiktokUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 TikTok에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('tiktok')
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-tiktok`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`TikTok 업로드 완료!\n프로필에서 확인하세요: ${json.profileUrl}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'TikTok 업로드 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleInstagramUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 Instagram Reels에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('instagram')
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-instagram`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`Instagram 업로드 완료!\n프로필에서 확인하세요: ${json.profileUrl}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Instagram 업로드 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">숏폼 관리</h1>
                    <p className="text-sm text-content-secondary mt-1">
                        이슈 승인/상태 전환 시 자동 생성된 숏폼 job 목록
                    </p>
                </div>
                <button
                    onClick={handleToggleManualCreate}
                    className="btn-primary btn-md"
                >
                    + 수동 생성
                </button>
            </div>

            {/* 수동 생성 인라인 폼 */}
            {manualCreateOpen && (
                <div className="mb-6 p-4 border border-primary-muted bg-primary-light/20 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-primary-dark">수동 숏폼 Job 생성</h2>
                        <button
                            type="button"
                            onClick={handleToggleManualCreate}
                            className="text-content-muted hover:text-content-secondary text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    {manualCreateError && <p className="text-sm text-red-500">{manualCreateError}</p>}

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-secondary">대상 이슈 (승인된 이슈만)</label>
                        {issueOptionsLoading ? (
                            <p className="text-sm text-content-muted">이슈 목록 불러오는 중...</p>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedIssueId}
                                    onChange={(e) => {
                                        setSelectedIssueId(e.target.value)
                                        setManualCreateError(null)
                                    }}
                                    disabled={manualCreateLoading}
                                    className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface appearance-none"
                                >
                                    <option value="">이슈를 선택하세요</option>
                                    {issueOptions.map((issue) => (
                                        <option key={issue.id} value={issue.id}>
                                            {issue.title}
                                            {issue.heat_index != null ? ` (화력 ${issue.heat_index})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <svg
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                        {!issueOptionsLoading && issueOptions.length === 0 && (
                            <p className="text-xs text-content-muted">승인된 이슈가 없습니다.</p>
                        )}
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={handleToggleManualCreate}
                            className="btn-neutral btn-sm"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleManualCreate}
                            disabled={!selectedIssueId || manualCreateLoading || issueOptionsLoading}
                            className="btn-primary btn-sm disabled:opacity-50"
                        >
                            {manualCreateLoading ? '생성 중...' : '등록'}
                        </button>
                    </div>
                </div>
            )}

            {/* 필터 탭 */}
            <div className="mb-4">
                <AdminTabFilter
                    tabs={FILTER_LABELS}
                    active={filter}
                    counts={tabCounts}
                    onChange={setFilter}
                />
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Job 목록 */}
            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                이슈 정보
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                화력/출처
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                트리거
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                상태
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                생성일
                            </th>
                            <th className="w-48 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={6} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : jobs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-sm text-content-muted">
                                    해당 상태의 숏폼 job이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            jobs.map((job) => {
                                const isProcessing = processingId === job.id
                                return (
                                    <tr key={job.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-3 text-sm">
                                            <Link
                                                href={`/issue/${job.issue_id}`}
                                                target="_blank"
                                                className="text-primary hover:underline font-medium inline-block max-w-full mb-1"
                                            >
                                                {job.issue_title}
                                            </Link>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    job.issue_status === '점화' ? 'bg-orange-100 text-orange-700' :
                                                    job.issue_status === '논란중' ? 'bg-red-100 text-red-700' :
                                                    'bg-surface-muted text-content-secondary'
                                                }`}>
                                                    {job.issue_status}
                                                </span>
                                            </div>
                                            {job.video_path && (
                                                <div className="mt-2 flex items-start gap-2">
                                                    <button
                                                        onClick={() => setPreviewJob(job)}
                                                        className="relative w-14 h-24 rounded-xl border border-border overflow-hidden group flex-shrink-0"
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
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`inline-block px-2 py-1 text-xs rounded-full mb-1 ${HEAT_GRADE_STYLE[job.heat_grade]}`}>
                                                화력 {job.heat_grade}
                                            </span>
                                            <div className="text-sm text-content-secondary">
                                                뉴스 {job.source_count.news}건 / 커뮤니티 {job.source_count.community}건
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-200">
                                                {TRIGGER_TYPE_LABEL[job.trigger_type]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${APPROVAL_STATUS_STYLE[job.approval_status]}`}>
                                                {job.approval_status === 'pending' ? '대기' :
                                                 job.approval_status === 'approved' ? '승인' : '반려'}
                                            </span>
                                            {job.upload_status && (
                                                <div className="mt-1 text-sm text-content-secondary">
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
                                        <td className="px-4 py-3 text-sm text-content-secondary">
                                            {formatDate(job.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {job.approval_status === 'pending' && (
                                                <div className="flex flex-col gap-1.5 min-w-max">
                                                    {!job.video_path && (
                                                        <button
                                                            onClick={() => handlePreviewImages(job)}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            이미지 확인
                                                        </button>
                                                    )}
                                                    {job.video_path && (
                                                        <div className="flex flex-nowrap gap-1.5">
                                                            <button
                                                                onClick={() => handleAction(job.id, 'approve')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(job.id, 'reject')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                반려
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {job.approval_status === 'approved' && !job.video_path && (
                                                <button
                                                    onClick={() => handleGenerate(job.id)}
                                                    disabled={isProcessing}
                                                    className="text-xs px-2.5 py-1.5 bg-primary text-white rounded-full hover:bg-primary-dark disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    동영상 생성
                                                </button>
                                            )}
                                            {job.approval_status === 'approved' && job.video_path && (
                                                (() => {
                                                    const youtubeStatus = (job.upload_status as any)?.youtube?.status
                                                    const youtubeUrl = (job.upload_status as any)?.youtube?.url
                                                    const isYoutubeUploaded = youtubeStatus === 'success'

                                                    const tiktokStatus = (job.upload_status as any)?.tiktok?.status
                                                    const tiktokProfileUrl = (job.upload_status as any)?.tiktok?.profileUrl
                                                    const isTiktokUploaded = tiktokStatus === 'success'

                                                    const instagramStatus = (job.upload_status as any)?.instagram?.status
                                                    const instagramProfileUrl = (job.upload_status as any)?.instagram?.profileUrl
                                                    const isInstagramUploaded = instagramStatus === 'success'

                                                    const allUploaded = isYoutubeUploaded && isTiktokUploaded && isInstagramUploaded
                                                    const uploadTargets = {
                                                        youtube: !isYoutubeUploaded,
                                                        tiktok: !isTiktokUploaded,
                                                        instagram: !isInstagramUploaded,
                                                    }

                                                    return (
                                                        <div className="flex flex-col gap-1.5 min-w-max">
                                                            {/* 전체 업로드 */}
                                                            {!allUploaded && (
                                                                <button
                                                                    onClick={() => handleAllUpload(job.id, uploadTargets)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    {isProcessing && uploadingAction === 'all' ? '업로드 중...' : '전체 업로드'}
                                                                </button>
                                                            )}

                                                            {/* YouTube */}
                                                            {isYoutubeUploaded ? (
                                                                <a
                                                                    href={youtubeUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                                >
                                                                    YouTube 완료 ✓
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleYoutubeUpload(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    {isProcessing && uploadingAction === 'youtube' ? 'YouTube 업로드 중...' : 'YouTube 업로드'}
                                                                </button>
                                                            )}

                                                            {/* TikTok */}
                                                            {isTiktokUploaded ? (
                                                                <a
                                                                    href={tiktokProfileUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                                >
                                                                    TikTok 완료 ✓
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleTiktokUpload(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    {isProcessing && uploadingAction === 'tiktok' ? 'TikTok 업로드 중...' : 'TikTok 업로드'}
                                                                </button>
                                                            )}

                                                            {/* Instagram */}
                                                            {isInstagramUploaded ? (
                                                                <a
                                                                    href={instagramProfileUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                                >
                                                                    Instagram 완료 ✓
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleInstagramUpload(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-pink-500 text-white rounded-full hover:bg-pink-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    {isProcessing && uploadingAction === 'instagram' ? 'Instagram 업로드 중...' : 'Instagram 업로드'}
                                                                </button>
                                                            )}

                                                            {/* 업로드 전: 승인 취소 / 업로드 후: 삭제 */}
                                                            {isYoutubeUploaded || isTiktokUploaded || isInstagramUploaded ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleDelete(job.id)}
                                                                        disabled={isProcessing}
                                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                    <p className="text-xs text-content-muted leading-snug">
                                                                        ※ 업로드된 게시물은 각 플랫폼에서 직접 삭제해야 합니다.
                                                                    </p>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleUnapprove(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    승인 취소
                                                                </button>
                                                            )}
                                                        </div>
                                                    )
                                                })()
                                            )}
                                            {job.approval_status === 'rejected' && (
                                                <button
                                                    onClick={() => handleDelete(job.id)}
                                                    disabled={isProcessing}
                                                    className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    삭제
                                                </button>
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
            <AdminPagination
                page={page}
                totalPages={Math.ceil(total / PAGE_SIZE)}
                total={total}
                pageSize={PAGE_SIZE}
                disabled={loading}
                onChange={(p) => { setPage(p); loadJobs(filter, p) }}
            />

            {/* 이미지 미리보기 모달 */}
            {imagePreview.open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => { if (!imagePreview.generating) setImagePreview((prev) => ({ ...prev, open: false })) }}
                >
                    <div
                        className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 헤더 */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-content-primary">이미지 미리보기</h2>
                                <p className="text-sm text-content-secondary mt-0.5">{imagePreview.jobTitle}</p>
                            </div>
                            <button
                                onClick={() => { if (!imagePreview.generating) setImagePreview((prev) => ({ ...prev, open: false })) }}
                                disabled={imagePreview.generating}
                                className="w-8 h-8 bg-surface-muted text-content-secondary rounded-full flex items-center justify-center hover:bg-surface-subtle flex-shrink-0 disabled:opacity-40"
                            >
                                ✕
                            </button>
                        </div>

                        {/* 이미지 영역 */}
                        {imagePreview.loading && (
                            <div className="grid grid-cols-3 gap-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="aspect-[9/16] bg-surface-muted rounded-xl animate-pulse" />
                                ))}
                            </div>
                        )}
                        {imagePreview.error && (
                            <p className="text-sm text-red-600 text-center py-8">{imagePreview.error}</p>
                        )}
                        {!imagePreview.loading && !imagePreview.error && imagePreview.images.length > 0 && (
                            <div className="grid grid-cols-3 gap-3">
                                {imagePreview.images.map((url, i) => (
                                    <div key={i} className="aspect-[9/16] rounded-xl overflow-hidden border border-border">
                                        <img src={url} alt={`이미지 ${i + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 하단 버튼 */}
                        <div className="flex items-center justify-between mt-4">
                            <button
                                onClick={handleRefreshImages}
                                disabled={imagePreview.loading || imagePreview.generating}
                                className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary disabled:opacity-40 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                    <path d="M21 3v5h-5"/>
                                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                    <path d="M3 21v-5h5"/>
                                </svg>
                                이미지 재생성
                            </button>
                            <button
                                onClick={async () => {
                                    const jobId = imagePreview.jobId
                                    const images = imagePreview.images
                                    setImagePreview((prev) => ({ ...prev, generating: true }))
                                    try {
                                        const res = await fetch(`/api/admin/shortform/${jobId}/generate`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ images }),
                                        })
                                        const json = await res.json()
                                        if (!res.ok) throw new Error(json.message || json.error)
                                        setImagePreview((prev) => ({ ...prev, open: false, generating: false }))
                                        alert('동영상 생성 완료!')
                                        await loadJobs(filter, page)
                                    } catch (e) {
                                        setImagePreview((prev) => ({ ...prev, generating: false }))
                                        alert(e instanceof Error ? e.message : '동영상 생성 실패')
                                    }
                                }}
                                disabled={imagePreview.loading || imagePreview.images.length === 0 || imagePreview.generating}
                                className="btn-primary btn-md disabled:opacity-50"
                            >
                                {imagePreview.generating ? '동영상 생성 중...' : '동영상 생성'}
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
                            controlsList="nodownload nofullscreen noremoteplayback"
                            disablePictureInPicture
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
                                className="text-blue-400 text-xs mt-1 block hover:underline hover:text-blue-300"
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
