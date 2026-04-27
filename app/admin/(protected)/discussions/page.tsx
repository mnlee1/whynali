'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { decodeHtml } from '@/lib/utils/decode-html'
import AdminTabFilter from '@/components/admin/AdminTabFilter'

interface Issue {
    id: string
    title: string
}

interface DiscussionTopic {
    id: string
    body: string
    issue_id: string
    is_ai_generated: boolean
    approval_status: '대기' | '진행중' | '마감'
    approved_at: string | null
    auto_end_date?: string | null
    created_at: string
    updated_at?: string | null
    issues: { id: string; title: string } | null
    view_count?: number
    comment_count?: number
}

type FilterStatus = '' | '대기' | '진행중' | '마감'

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: '대기', label: '대기' },
    { value: '진행중', label: '진행중' },
    { value: '마감', label: '마감' },
]

const STATUS_STYLE: Record<string, string> = {
    '대기': 'bg-yellow-100 text-yellow-700',
    '진행중': 'bg-green-100 text-green-700',
    '마감': 'bg-gray-100 text-gray-600',
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

function formatRelativeTime(dateString: string): string {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
    if (diff < 60) return `${diff}초 전`
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    return `${Math.floor(diff / 86400)}일 전`
}

export default function AdminDiscussionsPage() {
    const [topics, setTopics] = useState<DiscussionTopic[]>([])
    const [total, setTotal] = useState(0)
    const [filter, setFilter] = useState<FilterStatus>('대기')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    /* 다중 선택 */
    const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set())
    const [bulkProcessing, setBulkProcessing] = useState(false)

    /* 통합 생성 폼 */
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [approvedIssues, setApprovedIssues] = useState<Issue[]>([])
    const [loadingIssues, setLoadingIssues] = useState(false)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [newContent, setNewContent] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [generating, setGenerating] = useState(false)
    const [isAiFilled, setIsAiFilled] = useState(false)

    /* 수정 폼 */
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [submittingEdit, setSubmittingEdit] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)

    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '진행중': 1, '마감': 2 }

    const loadTabCounts = useCallback(async () => {
        const tabParams: { value: FilterStatus; params: Record<string, string> }[] = [
            { value: '', params: {} },
            { value: '대기', params: { approval_status: '대기' } },
            { value: '진행중', params: { approval_status: '진행중' } },
            { value: '마감', params: { approval_status: '마감' } },
        ]
        try {
            const results = await Promise.all(
                tabParams.map(({ params }) => {
                    const p = new URLSearchParams({ limit: '1', offset: '0', ...params })
                    return fetch(`/api/admin/discussions?${p}`).then(r => r.ok ? r.json() : null)
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

    /* 승인된 이슈 목록 로드 */
    const loadApprovedIssues = useCallback(async () => {
        setLoadingIssues(true)
        try {
            const res = await fetch('/api/admin/issues?approval_status=승인&limit=100')
            const json = await res.json()
            setApprovedIssues(json.data ?? [])
        } catch {
            setApprovedIssues([])
        } finally {
            setLoadingIssues(false)
        }
    }, [])

    /* 폼 열기 */
    const handleOpenForm = () => {
        setShowCreateForm(true)
        loadApprovedIssues()
    }

    /* 폼 닫기 */
    const handleCloseForm = () => {
        setShowCreateForm(false)
        setSelectedIssue(null)
        setNewContent('')
        setFormError(null)
        setIsAiFilled(false)
    }

    /* AI 생성으로 textarea 채우기 */
    const handleAiFill = async () => {
        if (!selectedIssue || generating) return
        setGenerating(true)
        setFormError(null)
        try {
            const res = await fetch('/api/admin/discussions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: selectedIssue.id, count: 1 }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const content = json.data?.[0]?.content ?? ''
            setNewContent(content)
            setIsAiFilled(true)
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'AI 생성 실패')
        } finally {
            setGenerating(false)
        }
    }

    /* 직접 입력 제출 */
    const handleSubmitManual = async () => {
        if (!selectedIssue || !newContent.trim() || submitting) return

        setSubmitting(true)
        setFormError(null)

        try {
            const res = await fetch('/api/admin/discussions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: selectedIssue.id,
                    content: newContent.trim(),
                    is_ai_generated: isAiFilled,
                    approval_status: '대기',
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            handleCloseForm()
            loadTopics(filter)
            loadTabCounts()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : '생성 실패')
        } finally {
            setSubmitting(false)
        }
    }

    const loadTopics = useCallback(async (status: FilterStatus) => {
        setLoading(true)
        setError(null)
        setSelectedTopicIds(new Set()) // 로드 시 선택 초기화
        try {
            const params = new URLSearchParams({ limit: '50' })
            if (status) params.set('approval_status', status)
            const res = await fetch(`/api/admin/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const data: DiscussionTopic[] = json.data ?? []
            /* 전체 탭일 때 대기 → 진행중 → 마감 순 정렬 */
            if (!status) {
                data.sort((a, b) =>
                    (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9)
                )
            }
            setTopics(data)
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTabCounts()
    }, [loadTabCounts])

    useEffect(() => {
        loadTopics(filter)
    }, [filter, loadTopics])

    /* 토론 주제 목록 다중 선택 토글 */
    const handleToggleTopicSelect = (id: string) => {
        setSelectedTopicIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    /* 토론 주제 목록 전체 선택/해제 */
    const handleToggleTopicAll = () => {
        if (selectedTopicIds.size === topics.length) {
            setSelectedTopicIds(new Set())
        } else {
            setSelectedTopicIds(new Set(topics.map(t => t.id)))
        }
    }

    /* 일괄 처리 */
    const handleBulkAction = async (action: '진행중' | '복구' | '마감' | '재개' | '삭제') => {
        if (selectedTopicIds.size === 0) return

        const confirmMsg =
            action === '진행중' ? `선택한 ${selectedTopicIds.size}개 토론 주제를 승인하시겠습니까?`
            : action === '복구' ? `선택한 ${selectedTopicIds.size}개 토론 주제를 대기 상태로 되돌리시겠습니까?`
            : action === '마감' ? `선택한 ${selectedTopicIds.size}개 토론 주제를 종료하시겠습니까?`
            : action === '재개' ? `선택한 ${selectedTopicIds.size}개 토론 주제를 재개하시겠습니까?`
            : `선택한 ${selectedTopicIds.size}개 토론 주제를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`

        if (!window.confirm(confirmMsg)) return

        setBulkProcessing(true)
        try {
            const selectedIds = Array.from(selectedTopicIds)
            const errors: string[] = []

            for (const id of selectedIds) {
                try {
                    let res
                    if (action === '삭제') {
                        res = await fetch(`/api/admin/discussions/${id}`, { method: 'DELETE' })
                    } else {
                        // '재개'는 API에 '진행중'으로 전달 (마감 → 진행중)
                        const apiAction = action === '재개' ? '진행중' : action
                        res = await fetch(`/api/admin/discussions/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: apiAction }),
                        })
                    }
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.error)
                } catch (e) {
                    errors.push(`${id}: ${e instanceof Error ? e.message : '처리 실패'}`)
                }
            }

            if (errors.length > 0) {
                alert(`일부 항목 처리 실패:\n${errors.join('\n')}`)
            }

            loadTopics(filter)
            loadTabCounts()
            setSelectedTopicIds(new Set())
        } catch (e) {
            alert(e instanceof Error ? e.message : '일괄 처리 실패')
        } finally {
            setBulkProcessing(false)
        }
    }

    const handleEditStart = (topic: DiscussionTopic) => {
        setEditingId(topic.id)
        setEditDraft(topic.body)
        setEditError(null)
    }

    const handleEditCancel = () => {
        setEditingId(null)
        setEditDraft('')
        setEditError(null)
    }

    const handleEditSave = async (id: string) => {
        if (!editDraft.trim() || submittingEdit) return
        setSubmittingEdit(true)
        setEditError(null)
        try {
            const res = await fetch(`/api/admin/discussions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editDraft.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setTopics((prev) =>
                prev.map((t) => t.id === id ? { ...t, body: json.data.body, updated_at: json.data.updated_at ?? null } : t)
            )
            setEditingId(null)
            setEditDraft('')
        } catch (e) {
            setEditError(e instanceof Error ? e.message : '수정 실패')
        } finally {
            setSubmittingEdit(false)
        }
    }

    const handleAction = async (id: string, action: '진행중' | '마감' | '복구') => {
        const topic = topics.find(t => t.id === id)
        const confirmMsg =
            action === '진행중'
                ? topic?.approval_status === '마감'
                    ? '이 토론 주제를 진행중으로 재개하시겠습니까? 자동 마감 조건이 초기화됩니다.'
                    : '이 토론 주제를 승인하시겠습니까?'
                : action === '마감'
                ? '이 토론 주제를 종료하시겠습니까? 댓글 작성이 차단됩니다.'
                : '이 토론 주제를 대기 상태로 복구하시겠습니까?'
        if (!window.confirm(confirmMsg)) return
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/discussions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            loadTopics(filter)
            loadTabCounts()
            setSelectedTopicIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 토론 주제를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/discussions/${id}`, {
                method: 'DELETE',
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            loadTopics(filter)
            loadTabCounts()
            setSelectedTopicIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setProcessingId(null)
        }
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-content-primary">토론 관리</h1>
                    <p className="text-sm text-content-muted mt-1">모든 토론 주제는 AI로 자동 생성됩니다.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleOpenForm}
                        className="btn-primary btn-md"
                    >
                        + 토론 생성
                    </button>
                </div>
            </div>

            {/* 통합 생성 폼 */}
            {showCreateForm && (
                <div className="mb-6 p-4 border border-primary-muted bg-primary-light/20 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-primary-dark">토론 생성</h2>
                        <button
                            onClick={handleCloseForm}
                            className="text-content-muted hover:text-content-secondary text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    {formError && (
                        <p className="text-sm text-red-500">{formError}</p>
                    )}

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-secondary">대상 이슈 (승인된 이슈만)</label>
                        {loadingIssues ? (
                            <p className="text-sm text-content-muted">이슈 목록 로딩 중...</p>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedIssue?.id ?? ''}
                                    onChange={(e) => {
                                        const issue = approvedIssues.find((i) => i.id === e.target.value)
                                        setSelectedIssue(issue ?? null)
                                        setNewContent('')
                                        setIsAiFilled(false)
                                        setFormError(null)
                                    }}
                                    className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface appearance-none"
                                >
                                    <option value="">이슈를 선택하세요</option>
                                    {approvedIssues.map((issue) => (
                                        <option key={issue.id} value={issue.id}>
                                            {issue.title}
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
                    </div>

                    {/* 토론 주제 내용 */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-content-secondary">토론 주제 내용</label>
                            <button
                                type="button"
                                onClick={handleAiFill}
                                disabled={!selectedIssue || generating}
                                className="btn-primary text-xs px-2.5 py-1 rounded-full"
                            >
                                {generating ? 'AI 생성 중...' : '✨ AI 생성'}
                            </button>
                        </div>
                        <textarea
                            value={newContent}
                            onChange={(e) => {
                                setNewContent(e.target.value)
                                setIsAiFilled(false)
                            }}
                            placeholder="토론 주제 내용을 직접 입력하거나, AI 생성 버튼을 눌러 자동 생성하세요"
                            rows={3}
                            maxLength={500}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary resize-none bg-surface"
                        />
                        <p className="text-sm text-content-muted text-right">{newContent.length}/500</p>
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={handleCloseForm}
                            className="btn-neutral btn-sm"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitManual}
                            disabled={!selectedIssue || !newContent.trim() || submitting}
                            className="btn-primary btn-sm disabled:opacity-50"
                        >
                            {submitting ? '생성 중...' : '생성'}
                        </button>
                    </div>
                </div>
            )}

            {/* 필터 탭 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <AdminTabFilter
                    tabs={FILTER_LABELS}
                    active={filter}
                    counts={tabCounts}
                    onChange={setFilter}
                />

                {/* 일괄 처리 버튼 */}
                {selectedTopicIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-content-secondary">
                            {selectedTopicIds.size}개 선택
                        </span>
                        {/* 승인: 대기 탭 */}
                        {filter === '대기' && (
                            <button
                                onClick={() => handleBulkAction('진행중')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 승인
                            </button>
                        )}
                        {/* 복구: 진행중 탭 */}
                        {filter === '진행중' && (
                            <button
                                onClick={() => handleBulkAction('복구')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-full hover:bg-yellow-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 복구
                            </button>
                        )}
                        {/* 마감: 진행중 탭 */}
                        {filter === '진행중' && (
                            <button
                                onClick={() => handleBulkAction('마감')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 마감
                            </button>
                        )}
                        {/* 재개: 마감 탭 */}
                        {filter === '마감' && (
                            <button
                                onClick={() => handleBulkAction('재개')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                            >
                                일괄 재개
                            </button>
                        )}
                        {/* 삭제: 모든 탭 */}
                        <button
                            onClick={() => handleBulkAction('삭제')}
                            disabled={bulkProcessing}
                            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedTopicIds(new Set())}
                            className="px-3 py-1.5 text-sm bg-surface border border-border text-content-secondary rounded-full hover:bg-surface-subtle whitespace-nowrap"
                        >
                            선택 해제
                        </button>
                    </div>
                )}
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 토론 주제 목록 */}
            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="w-12 px-4 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={topics.length > 0 && selectedTopicIds.size === topics.length}
                                    onChange={handleToggleTopicAll}
                                    className="w-4 h-4 accent-primary"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                토론 내용
                            </th>
                            <th className="w-64 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                연결 이슈
                            </th>
                            <th className="w-20 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                승인 상태
                            </th>
                            <th className="w-16 px-4 py-3 text-right text-sm font-medium text-content-muted uppercase">
                                의견수
                            </th>
                            <th className="w-16 px-4 py-3 text-right text-sm font-medium text-content-muted uppercase">
                                조회수
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                생성일
                            </th>
                            <th className="w-56 px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={8} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : topics.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center text-sm text-content-muted">
                                    해당 상태의 토론 주제가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            topics.map((topic) => {
                                const isProcessing = processingId === topic.id
                                const isEditing = editingId === topic.id
                                const isSelected = selectedTopicIds.has(topic.id)
                                return (
                                    <tr key={topic.id} className={isSelected ? 'bg-primary-light/20' : 'hover:bg-surface-subtle'}>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleTopicSelect(topic.id)}
                                                className="w-4 h-4 accent-primary"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary max-w-xs">
                                            {isEditing ? (
                                                <div className="space-y-1">
                                                    <textarea
                                                        value={editDraft}
                                                        onChange={(e) => setEditDraft(e.target.value)}
                                                        rows={3}
                                                        maxLength={500}
                                                        className="w-full px-2 py-1 text-sm border border-primary rounded-xl resize-none focus:outline-none bg-surface"
                                                    />
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-content-muted flex-1">{editDraft.length}/500</span>
                                                        <button
                                                            onClick={() => handleEditSave(topic.id)}
                                                            disabled={!editDraft.trim() || submittingEdit}
                                                            className="text-xs px-2.5 py-1.5 bg-primary text-white rounded-full hover:bg-primary-dark disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            {submittingEdit ? '저장 중...' : '저장'}
                                                        </button>
                                                        <button
                                                            onClick={handleEditCancel}
                                                            disabled={submittingEdit}
                                                            className="text-xs px-2.5 py-1.5 bg-surface border border-border text-content-secondary rounded-full hover:bg-surface-subtle disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                    {editError && (
                                                        <p className="text-xs text-red-500">{editError}</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="line-clamp-2">{decodeHtml(topic.body)}</p>
                                                    {topic.auto_end_date && topic.approval_status === '진행중' && (
                                                        <span className="text-xs text-primary block mt-1">
                                                            📅 {new Date(topic.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료예정
                                                        </span>
                                                    )}
                                                    {topic.auto_end_date && topic.approval_status === '마감' && (
                                                        <span className="text-xs text-content-muted block mt-1">
                                                            📅 {new Date(topic.auto_end_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 종료됨
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm max-w-xs">
                                            {topic.issues ? (
                                                <Link
                                                    href={`/issue/${topic.issues.id}`}
                                                    target="_blank"
                                                    className="text-primary hover:underline line-clamp-2 break-words inline-block max-w-full"
                                                >
                                                    {decodeHtml(topic.issues?.title ?? '')}
                                                </Link>
                                            ) : (
                                                <span className="text-content-muted">연결 없음</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full ${STATUS_STYLE[topic.approval_status]}`}>
                                                {topic.approval_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary text-right font-medium">
                                            {topic.comment_count ?? 0}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-primary text-right font-medium">
                                            {(topic.view_count ?? 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary">
                                            <div>{formatDate(topic.created_at)}</div>
                                            {topic.updated_at && (
                                                <div className="text-xs text-primary mt-0.5">
                                                    {formatRelativeTime(topic.updated_at)} 수정됨
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {!isEditing && (
                                                <div className="flex flex-nowrap gap-1.5 min-w-max">
                                                    {/* 수정 버튼: 모든 상태에서 노출 */}
                                                    <button
                                                        onClick={() => handleEditStart(topic)}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-surface border border-border text-content-secondary rounded-full hover:bg-surface-subtle disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        수정
                                                    </button>
                                                    {topic.approval_status === '대기' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '진행중')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(topic.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                삭제
                                                            </button>
                                                        </>
                                                    )}
                                                    {topic.approval_status === '진행중' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '복구')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                복구
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '마감')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                마감
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(topic.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                삭제
                                                            </button>
                                                        </>
                                                    )}
                                                    {topic.approval_status === '마감' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '진행중')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                재개
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(topic.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                삭제
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
