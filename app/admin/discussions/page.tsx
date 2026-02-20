'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface DiscussionTopic {
    id: string
    body: string
    issue_id: string
    is_ai_generated: boolean
    approval_status: '대기' | '승인' | '반려'
    approved_at: string | null
    created_at: string
    issues: { id: string; title: string } | null
}

type FilterStatus = '' | '대기' | '승인' | '반려'

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: '대기', label: '대기' },
    { value: '승인', label: '승인' },
    { value: '반려', label: '반려' },
]

const STATUS_STYLE: Record<string, string> = {
    '대기': 'bg-yellow-100 text-yellow-700',
    '승인': 'bg-green-100 text-green-700',
    '반려': 'bg-red-100 text-red-700',
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function AdminDiscussionsPage() {
    const [topics, setTopics] = useState<DiscussionTopic[]>([])
    const [total, setTotal] = useState(0)
    const [filter, setFilter] = useState<FilterStatus>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    /* 신규 생성 폼 */
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newIssueId, setNewIssueId] = useState('')
    const [newContent, setNewContent] = useState('')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    const loadTopics = useCallback(async (status: FilterStatus) => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({ limit: '50' })
            if (status) params.set('approval_status', status)
            const res = await fetch(`/api/admin/discussions?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setTopics(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTopics(filter)
    }, [filter, loadTopics])

    const handleAction = async (id: string, action: '승인' | '반려') => {
        const label = action === '승인' ? '승인' : '숨김(반려)'
        if (!window.confirm(`이 토론 주제를 ${label} 처리하시겠습니까?`)) return
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/discussions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setTopics((prev) =>
                prev.map((t) =>
                    t.id === id
                        ? {
                              ...t,
                              approval_status: action,
                              approved_at: action === '승인' ? new Date().toISOString() : null,
                          }
                        : t
                )
            )
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('토론 주제를 완전히 삭제하시겠습니까? 복구 불가합니다.')) return
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/discussions/${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setTopics((prev) => prev.filter((t) => t.id !== id))
            setTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newIssueId.trim() || !newContent.trim()) return
        setCreating(true)
        setCreateError(null)
        try {
            const res = await fetch('/api/admin/discussions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: newIssueId.trim(), content: newContent.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setNewIssueId('')
            setNewContent('')
            setShowCreateForm(false)
            loadTopics(filter)
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : '생성 실패')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
                        ← 관리자 홈
                    </Link>
                    <h1 className="text-2xl font-bold mt-1">토론 주제 관리</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => loadTopics(filter)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        + 직접 생성
                    </button>
                </div>
            </div>

            {/* 신규 생성 폼 */}
            {showCreateForm && (
                <form
                    onSubmit={handleCreate}
                    className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-3"
                >
                    <h2 className="text-sm font-semibold text-blue-800">토론 주제 직접 생성</h2>
                    {createError && (
                        <p className="text-sm text-red-500">{createError}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            type="text"
                            value={newIssueId}
                            onChange={(e) => setNewIssueId(e.target.value)}
                            placeholder="이슈 ID (UUID)"
                            className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                        />
                        <input
                            type="text"
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            placeholder="토론 주제 내용"
                            className="md:col-span-2 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={!newIssueId.trim() || !newContent.trim() || creating}
                            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                            {creating ? '생성 중...' : '생성'}
                        </button>
                    </div>
                </form>
            )}

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
                <span className="ml-auto text-sm text-gray-500 self-center">
                    총 {total}개
                </span>
            </div>

            {/* 에러 */}
            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 스켈레톤 */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 border rounded-lg space-y-2">
                            <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
                            <div className="h-3 w-1/4 bg-gray-100 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            ) : topics.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                    해당 상태의 토론 주제가 없습니다.
                </p>
            ) : (
                <ul className="space-y-3">
                    {topics.map((topic) => {
                        const isProcessing = processingId === topic.id
                        return (
                            <li
                                key={topic.id}
                                className="p-4 border border-gray-200 rounded-lg bg-white"
                            >
                                {/* 상단: 배지 + 날짜 */}
                                <div className="flex items-center gap-2 mb-2">
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLE[topic.approval_status]}`}
                                    >
                                        {topic.approval_status}
                                    </span>
                                    {topic.is_ai_generated && (
                                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-200">
                                            AI 생성
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400 ml-auto">
                                        {formatDate(topic.created_at)}
                                    </span>
                                </div>

                                {/* 본문 */}
                                <p className="text-sm text-gray-800 mb-2 line-clamp-2">
                                    {topic.body}
                                </p>

                                {/* 연결 이슈 + 액션 버튼 */}
                                <div className="flex items-center justify-between">
                                    <div className="text-xs text-gray-400">
                                        {topic.issues ? (
                                            <Link
                                                href={`/issue/${topic.issues.id}`}
                                                target="_blank"
                                                className="text-blue-500 hover:underline"
                                            >
                                                {topic.issues.title}
                                            </Link>
                                        ) : (
                                            <span>이슈 연결 없음</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {topic.approval_status !== '승인' && (
                                            <button
                                                onClick={() => handleAction(topic.id, '승인')}
                                                disabled={isProcessing}
                                                className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                            >
                                                승인
                                            </button>
                                        )}
                                        {topic.approval_status !== '반려' && (
                                            <button
                                                onClick={() => handleAction(topic.id, '반려')}
                                                disabled={isProcessing}
                                                className="text-xs px-3 py-1.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                                            >
                                                숨김
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(topic.id)}
                                            disabled={isProcessing}
                                            className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                        >
                                            {isProcessing ? '처리 중...' : '삭제'}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
