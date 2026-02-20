'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Comment } from '@/types'

interface CommentsSectionProps {
    /** 이슈 댓글: issueId 전달 */
    issueId?: string
    /** 토론 주제 댓글: discussionTopicId 전달 */
    discussionTopicId?: string
    userId: string | null
}

const PAGE_SIZE = 20
/* Rate Limit 제한 시간(초) — safety.ts RATE_LIMIT.windowMs 와 맞춤 */
const RATE_LIMIT_SECONDS = 60

function formatRelativeTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}일 전`
    return new Date(dateString).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

/* user_id 마지막 4자리로 익명 표시 */
function maskUserId(userId: string): string {
    return `사용자 …${userId.slice(-4)}`
}

export default function CommentsSection({ issueId, discussionTopicId, userId }: CommentsSectionProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /* 작성 */
    const [draft, setDraft] = useState('')
    const [submittingWrite, setSubmittingWrite] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)
    /* 에러 종류: 'rate_limit' | 'validation' | null */
    const [writeErrorType, setWriteErrorType] = useState<'rate_limit' | 'validation' | null>(null)
    /* Rate Limit 카운트다운 (초) */
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    /* 수정 중인 댓글 */
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [submittingEdit, setSubmittingEdit] = useState(false)

    /* 삭제 처리 중 */
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const loadComments = useCallback(async (currentOffset: number, append: boolean) => {
        try {
            const contextParam = issueId
                ? `issue_id=${issueId}`
                : `discussion_topic_id=${discussionTopicId}`
            const res = await fetch(
                `/api/comments?${contextParam}&limit=${PAGE_SIZE}&offset=${currentOffset}`
            )
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setComments((prev) => append ? [...prev, ...(json.data ?? [])] : (json.data ?? []))
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '댓글 조회 실패')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [issueId, discussionTopicId])

    useEffect(() => {
        loadComments(0, false)
    }, [loadComments])

    /* Rate Limit 카운트다운 인터벌 */
    const startRateLimitCountdown = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setRateLimitCountdown(RATE_LIMIT_SECONDS)
        countdownRef.current = setInterval(() => {
            setRateLimitCountdown((prev) => {
                if (prev <= 1) {
                    if (countdownRef.current) clearInterval(countdownRef.current)
                    setWriteError(null)
                    setWriteErrorType(null)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }, [])

    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current)
        }
    }, [])

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadComments(next, true)
    }

    const handleWrite = async () => {
        if (!userId || !draft.trim() || submittingWrite || rateLimitCountdown > 0) return
        setSubmittingWrite(true)
        setWriteError(null)
        setWriteErrorType(null)
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: issueId ?? null,
                    discussion_topic_id: discussionTopicId ?? null,
                    content: draft.trim(),
                }),
            })
            const json = await res.json()

            if (res.status === 429) {
                /* Rate Limit: 카운트다운 시작 */
                setWriteErrorType('rate_limit')
                setWriteError(json.error ?? '잠시 후 다시 시도해 주세요.')
                startRateLimitCountdown()
                return
            }
            if (res.status === 400) {
                /* 검증 오류: 금칙어·길이 초과 등 */
                setWriteErrorType('validation')
                setWriteError(json.error ?? '입력 내용을 확인해 주세요.')
                return
            }
            if (!res.ok) {
                setWriteError(json.error ?? '오류가 발생했습니다.')
                return
            }

            setDraft('')
            setOffset(0)
            await loadComments(0, false)
        } catch {
            setWriteError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.')
        } finally {
            setSubmittingWrite(false)
        }
    }

    const handleEditStart = (comment: Comment) => {
        setEditingId(comment.id)
        setEditDraft(comment.body)
    }

    const handleEditCancel = () => {
        setEditingId(null)
        setEditDraft('')
    }

    const handleEditSave = async (commentId: string) => {
        if (!editDraft.trim() || submittingEdit) return
        setSubmittingEdit(true)
        try {
            const res = await fetch(`/api/comments/${commentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editDraft.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setEditingId(null)
            setEditDraft('')
            setComments((prev) =>
                prev.map((c) => (c.id === commentId ? { ...c, body: editDraft.trim() } : c))
            )
        } catch (e) {
            setError(e instanceof Error ? e.message : '수정 실패')
        } finally {
            setSubmittingEdit(false)
        }
    }

    const handleDelete = async (commentId: string) => {
        if (!window.confirm('댓글을 삭제하시겠습니까?')) return
        setDeletingId(commentId)
        try {
            const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setComments((prev) => prev.filter((c) => c.id !== commentId))
            setTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            setError(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    /* 스켈레톤 */
    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex gap-3">
                            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                            <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
                        </div>
                        <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        )
    }

    const hasMore = comments.length < total

    return (
        <div>
            {error && (
                <p className="text-sm text-red-500 mb-3">{error}</p>
            )}

            {/* 댓글 수 */}
            <p className="text-sm text-gray-500 mb-4">댓글 {total.toLocaleString()}개</p>

            {/* 목록 */}
            {comments.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    첫 번째 댓글을 작성해보세요.
                </p>
            ) : (
                <ul className="divide-y divide-gray-100 mb-4">
                    {comments.map((comment) => {
                        const isMine = userId === comment.user_id
                        const isEditing = editingId === comment.id
                        const isDeleting = deletingId === comment.id

                        return (
                            <li key={comment.id} className="py-4">
                                {/* 작성자 + 시간 */}
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-500">
                                        {maskUserId(comment.user_id)}
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400">
                                            {formatRelativeTime(comment.created_at)}
                                        </span>
                                        {isMine && !isEditing && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEditStart(comment)}
                                                    className="text-xs text-gray-500 hover:text-gray-700"
                                                >
                                                    수정
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(comment.id)}
                                                    disabled={isDeleting}
                                                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                                                >
                                                    {isDeleting ? '삭제 중...' : '삭제'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 본문 또는 수정 폼 */}
                                {isEditing ? (
                                    <div className="mt-2 space-y-2">
                                        <textarea
                                            value={editDraft}
                                            onChange={(e) => setEditDraft(e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:border-blue-400"
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={handleEditCancel}
                                                className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={() => handleEditSave(comment.id)}
                                                disabled={!editDraft.trim() || submittingEdit}
                                                className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {submittingEdit ? '저장 중...' : '저장'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-800 leading-relaxed">
                                        {comment.body}
                                    </p>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}

            {/* 더보기 */}
            {hasMore && (
                <div className="text-center mb-6">
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm px-5 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${total - comments.length}개 남음)`}
                    </button>
                </div>
            )}

            {/* 작성 폼 */}
            <div className="pt-4 border-t border-gray-100">
                {userId ? (
                    <div className="space-y-2">
                        {/* Rate Limit 에러: 카운트다운 박스 */}
                        {writeErrorType === 'rate_limit' && writeError && (
                            <div className="flex items-center gap-3 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded text-sm">
                                <span className="text-yellow-700 flex-1">{writeError}</span>
                                {rateLimitCountdown > 0 && (
                                    <span className="text-yellow-800 font-semibold tabular-nums shrink-0">
                                        {rateLimitCountdown}초 후 재시도 가능
                                    </span>
                                )}
                            </div>
                        )}
                        {/* 검증/기타 에러: 빨간 텍스트 */}
                        {writeErrorType !== 'rate_limit' && writeError && (
                            <p className="text-sm text-red-500">{writeError}</p>
                        )}
                        <textarea
                            value={draft}
                            onChange={(e) => {
                                setDraft(e.target.value)
                                /* 검증 에러는 다시 타이핑하면 초기화 */
                                if (writeErrorType === 'validation') {
                                    setWriteError(null)
                                    setWriteErrorType(null)
                                }
                            }}
                            placeholder="댓글을 입력하세요..."
                            rows={3}
                            className={[
                                'w-full px-3 py-2 text-sm border rounded resize-none focus:outline-none',
                                writeErrorType === 'validation'
                                    ? 'border-red-400 focus:border-red-500'
                                    : 'border-gray-300 focus:border-blue-400',
                            ].join(' ')}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                                {draft.length} / 1000
                            </span>
                            <button
                                onClick={handleWrite}
                                disabled={!draft.trim() || submittingWrite || rateLimitCountdown > 0}
                                className="text-sm px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submittingWrite ? '등록 중...' : '등록'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-3">
                        <a href="/login" className="text-blue-600 underline">로그인</a>하면 댓글을 작성할 수 있습니다.
                    </p>
                )}
            </div>
        </div>
    )
}
