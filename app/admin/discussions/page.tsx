'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { decodeHtml } from '@/lib/utils/decode-html'

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
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

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

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '진행중': 1, '마감': 2 }

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
            setLastRefreshedAt(new Date())
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

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
    const handleBulkAction = async (action: '진행중' | '마감' | '삭제') => {
        if (selectedTopicIds.size === 0) return

        const confirmMsg =
            action === '진행중'
                ? `선택한 ${selectedTopicIds.size}개 토론 주제를 승인하시겠습니까?`
                : action === '마감'
                ? `선택한 ${selectedTopicIds.size}개 토론 주제를 종료하시겠습니까?`
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
                        res = await fetch(`/api/admin/discussions/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action }),
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
                    <h1 className="text-2xl font-bold">토론 주제 관리</h1>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => loadTopics(filter)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                    <button
                        onClick={handleOpenForm}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        + 토론 주제 생성
                    </button>
                </div>
            </div>

            {/* 통합 생성 폼 */}
            {showCreateForm && (
                <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-blue-800">토론 주제 생성</h2>
                        <button
                            onClick={handleCloseForm}
                            className="text-blue-400 hover:text-blue-600 text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>

                    {formError && (
                        <p className="text-sm text-red-500">{formError}</p>
                    )}

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">대상 이슈 (승인된 이슈만)</label>
                        {loadingIssues ? (
                            <p className="text-xs text-gray-400">이슈 목록 로딩 중...</p>
                        ) : (
                            <select
                                value={selectedIssue?.id ?? ''}
                                onChange={(e) => {
                                    const issue = approvedIssues.find((i) => i.id === e.target.value)
                                    setSelectedIssue(issue ?? null)
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                            >
                                <option value="">이슈를 선택하세요</option>
                                {approvedIssues.map((issue) => (
                                    <option key={issue.id} value={issue.id}>
                                        {issue.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 토론 주제 내용 */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-gray-600">토론 주제 내용</label>
                            <button
                                type="button"
                                onClick={handleAiFill}
                                disabled={!selectedIssue || generating}
                                className="text-xs px-2.5 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
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
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400 resize-none"
                        />
                        <p className="text-xs text-gray-400 text-right">{newContent.length}/500</p>
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={handleCloseForm}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitManual}
                            disabled={!selectedIssue || !newContent.trim() || submitting}
                            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                            {submitting ? '생성 중...' : '생성'}
                        </button>
                    </div>
                </div>
            )}

            {/* 필터 탭 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex gap-2">
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
                    <span className="ml-auto text-sm text-gray-500 self-center">
                        총 {total}개
                    </span>
                </div>

                {/* 일괄 처리 버튼 */}
                {selectedTopicIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                            {selectedTopicIds.size}개 선택
                        </span>
                        {filter === '대기' && (
                            <button
                                onClick={() => handleBulkAction('진행중')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                            >
                                일괄 승인
                            </button>
                        )}
                        {filter === '진행중' && (
                            <button
                                onClick={() => handleBulkAction('마감')}
                                disabled={bulkProcessing}
                                className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                            >
                                일괄 종료
                            </button>
                        )}
                        <button
                            onClick={() => handleBulkAction('삭제')}
                            disabled={bulkProcessing}
                            className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedTopicIds(new Set())}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            선택 해제
                        </button>
                    </div>
                )}
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 토론 주제 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-12 px-4 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={topics.length > 0 && selectedTopicIds.size === topics.length}
                                    onChange={handleToggleTopicAll}
                                    className="w-4 h-4"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                토론 내용
                            </th>
                            <th className="w-64 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                연결 이슈
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성 유형
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                승인 상태
                            </th>
                            <th className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                생성일
                            </th>
                            <th className="w-56 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="px-4 py-3">
                                        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : topics.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                                    해당 상태의 토론 주제가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            topics.map((topic) => {
                                const isProcessing = processingId === topic.id
                                const isEditing = editingId === topic.id
                                const isSelected = selectedTopicIds.has(topic.id)
                                return (
                                    <tr key={topic.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleTopicSelect(topic.id)}
                                                className="w-4 h-4"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs">
                                            {isEditing ? (
                                                <div className="space-y-1">
                                                    <textarea
                                                        value={editDraft}
                                                        onChange={(e) => setEditDraft(e.target.value)}
                                                        rows={3}
                                                        maxLength={500}
                                                        className="w-full px-2 py-1 text-sm border border-blue-400 rounded resize-none focus:outline-none"
                                                    />
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-400 flex-1">{editDraft.length}/500</span>
                                                        <button
                                                            onClick={() => handleEditSave(topic.id)}
                                                            disabled={!editDraft.trim() || submittingEdit}
                                                            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                                        >
                                                            {submittingEdit ? '저장 중...' : '저장'}
                                                        </button>
                                                        <button
                                                            onClick={handleEditCancel}
                                                            disabled={submittingEdit}
                                                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                    {editError && (
                                                        <p className="text-xs text-red-500">{editError}</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="line-clamp-2">{decodeHtml(topic.body)}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm max-w-xs">
                                            {topic.issues ? (
                                                <Link
                                                    href={`/issue/${topic.issues.id}`}
                                                    target="_blank"
                                                    className="text-blue-600 hover:underline line-clamp-2 break-words"
                                                >
                                                    {decodeHtml(topic.issues.title)}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-400">연결 없음</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {topic.is_ai_generated ? (
                                                <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-200">
                                                    AI 생성
                                                </span>
                                            ) : (
                                                <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-500 rounded border border-gray-200">
                                                    직접 생성
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded ${STATUS_STYLE[topic.approval_status]}`}>
                                                {topic.approval_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            <div>{formatDate(topic.created_at)}</div>
                                            {topic.updated_at && (
                                                <div className="text-xs text-blue-500 mt-0.5">
                                                    {formatRelativeTime(topic.updated_at)} 수정됨
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {!isEditing && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {/* 수정 버튼: 모든 상태에서 노출 */}
                                                    <button
                                                        onClick={() => handleEditStart(topic)}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        수정
                                                    </button>
                                                    {topic.approval_status === '대기' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '진행중')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(topic.id, '마감')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                                                            >
                                                                마감
                                                            </button>
                                                        </>
                                                    )}
                                                    {topic.approval_status === '진행중' && (
                                                        <button
                                                            onClick={() => handleAction(topic.id, '마감')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                                                        >
                                                            종료
                                                        </button>
                                                    )}
                                                    {topic.approval_status === '마감' && (
                                                        <button
                                                            onClick={() => handleAction(topic.id, '진행중')}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                                        >
                                                            재개
                                                        </button>
                                                    )}
                                                    {/* 삭제 버튼: 모든 상태에서 노출 */}
                                                    <button
                                                        onClick={() => handleDelete(topic.id)}
                                                        disabled={isProcessing}
                                                        className="text-xs px-2.5 py-1.5 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                                                    >
                                                        삭제
                                                    </button>
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
