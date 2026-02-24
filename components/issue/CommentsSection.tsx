'use client'

/**
 * components/issue/CommentsSection.tsx
 *
 * 이슈 댓글 및 토론 댓글 섹션.
 * - 베스트 댓글(score 상위) 상단 고정
 * - 리스트 정렬: 최신순 / 좋아요순 / 싫어요순
 * - 댓글별 좋아요/싫어요 버튼 (토글, 1인 1회)
 * - 작성/수정/삭제, 세이프티봇 연동
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Comment } from '@/types'

interface CommentsSectionProps {
    issueId?: string
    discussionTopicId?: string
    userId: string | null
    isClosed?: boolean
}

type SortOption = 'latest' | 'likes' | 'dislikes'

type CommentWithLike = Comment & { userLikeType?: 'like' | 'dislike' | null }

const PAGE_SIZE = 20
const RATE_LIMIT_SECONDS = 60

const SORT_LABELS: Record<SortOption, string> = {
    latest: '최신순',
    likes: '좋아요순',
    dislikes: '싫어요순',
}

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

function authorLabel(comment: Comment): string {
    if (comment.display_name?.trim()) return comment.display_name.trim()
    return `사용자 …${comment.user_id.slice(-4)}`
}

export default function CommentsSection({
    issueId,
    discussionTopicId,
    userId: serverUserId,
    isClosed = false,
}: CommentsSectionProps) {
    const [userId, setUserId] = useState<string | null>(serverUserId)
    const [bestComments, setBestComments] = useState<CommentWithLike[]>([])
    const [comments, setComments] = useState<CommentWithLike[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [sort, setSort] = useState<SortOption>('latest')
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [draft, setDraft] = useState('')
    const [submittingWrite, setSubmittingWrite] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)
    const [writeErrorType, setWriteErrorType] = useState<'rate_limit' | 'validation' | null>(null)
    const [pendingNotice, setPendingNotice] = useState<string | null>(null)
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [submittingEdit, setSubmittingEdit] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [likingId, setLikingId] = useState<string | null>(null)

    /* 인증 보완: SSR에서 userId를 못 받은 경우 클라이언트에서 재조회 */
    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

    const contextParam = issueId
        ? `issue_id=${issueId}`
        : `discussion_topic_id=${discussionTopicId}`

    /* 베스트 댓글 조회 */
    const loadBest = useCallback(async () => {
        try {
            const res = await fetch(`/api/comments?${contextParam}&best=true`)
            const json = await res.json()
            if (res.ok) setBestComments(json.data ?? [])
        } catch { /* 베스트 조회 실패는 무시 */ }
    }, [contextParam])

    /* 일반 댓글 목록 조회 */
    const loadComments = useCallback(async (
        currentOffset: number,
        append: boolean,
        currentSort: SortOption
    ) => {
        try {
            const res = await fetch(
                `/api/comments?${contextParam}&limit=${PAGE_SIZE}&offset=${currentOffset}&sort=${currentSort}`
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
    }, [contextParam])

    /* 초기 로드 */
    useEffect(() => {
        setLoading(true)
        loadBest()
        loadComments(0, false, sort)
    }, [loadBest, loadComments, sort])

    /* 정렬 변경 */
    const handleSortChange = (newSort: SortOption) => {
        if (newSort === sort) return
        setSort(newSort)
        setOffset(0)
        setLoading(true)
        loadComments(0, false, newSort)
    }

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadComments(next, true, sort)
    }

    /* Rate Limit 카운트다운 */
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

    useEffect(() => () => {
        if (countdownRef.current) clearInterval(countdownRef.current)
    }, [])

    const handleWrite = async () => {
        if (!userId || !draft.trim() || submittingWrite || rateLimitCountdown > 0) return
        setSubmittingWrite(true)
        setWriteError(null)
        setWriteErrorType(null)
        setPendingNotice(null)
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
                setWriteErrorType('rate_limit')
                setWriteError(json.error ?? '잠시 후 다시 시도해 주세요.')
                startRateLimitCountdown()
                return
            }
            if (res.status === 400) {
                setWriteErrorType('validation')
                setWriteError(json.error ?? '입력 내용을 확인해 주세요.')
                return
            }
            if (!res.ok) { setWriteError(json.error ?? '오류가 발생했습니다.'); return }

            setDraft('')
            if (json.pending) {
                setPendingNotice(json.message ?? '등록되었습니다. 내용 검토 후 공개되거나 삭제될 수 있습니다.')
                return
            }

            setOffset(0)
            loadBest()
            await loadComments(0, false, sort)
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
    const handleEditCancel = () => { setEditingId(null); setEditDraft('') }

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
                prev.map((c) => c.id === commentId ? { ...c, body: editDraft.trim() } : c)
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
            setBestComments((prev) => prev.filter((c) => c.id !== commentId))
            setTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            setError(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    /* 댓글 좋아요/싫어요 토글 */
    const handleLike = async (commentId: string, type: 'like' | 'dislike') => {
        if (!userId || likingId) return
        setLikingId(commentId)
        try {
            const res = await fetch(`/api/comments/${commentId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            })
            const json = await res.json()
            if (!res.ok) return

            const updater = (prev: CommentWithLike[]) =>
                prev.map((c) =>
                    c.id === commentId
                        ? { ...c, like_count: json.like_count, dislike_count: json.dislike_count, userLikeType: json.userType }
                        : c
                )
            setComments(updater)
            setBestComments(updater)
        } finally {
            setLikingId(null)
        }
    }

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
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {/* 베스트 댓글 */}
            {bestComments.length > 0 && (
                <div className="mb-6">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                        베스트 댓글
                    </p>
                    <ul className="space-y-2">
                        {bestComments.map((comment) => (
                            <CommentItem
                                key={`best-${comment.id}`}
                                comment={comment}
                                userId={userId}
                                isBest
                                editingId={editingId}
                                editDraft={editDraft}
                                submittingEdit={submittingEdit}
                                deletingId={deletingId}
                                likingId={likingId}
                                onEditStart={handleEditStart}
                                onEditCancel={handleEditCancel}
                                onEditSave={handleEditSave}
                                onDelete={handleDelete}
                                onLike={handleLike}
                                setEditDraft={setEditDraft}
                            />
                        ))}
                    </ul>
                    <hr className="mt-4 border-gray-100" />
                </div>
            )}

            {/* 정렬 옵션 + 총 댓글 수 */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">댓글 {total.toLocaleString()}개</p>
                <div className="flex gap-1">
                    {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                        <button
                            key={s}
                            onClick={() => handleSortChange(s)}
                            className={[
                                'text-xs px-2.5 py-1 rounded border transition-colors',
                                sort === s
                                    ? 'border-gray-800 bg-gray-800 text-white'
                                    : 'border-gray-200 text-gray-500 hover:border-gray-400',
                            ].join(' ')}
                        >
                            {SORT_LABELS[s]}
                        </button>
                    ))}
                </div>
            </div>

            {/* 댓글 목록 */}
            {comments.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    첫 번째 댓글을 작성해보세요.
                </p>
            ) : (
                <ul className="divide-y divide-gray-100 mb-4">
                    {comments.map((comment) => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            userId={userId}
                            editingId={editingId}
                            editDraft={editDraft}
                            submittingEdit={submittingEdit}
                            deletingId={deletingId}
                            likingId={likingId}
                            onEditStart={handleEditStart}
                            onEditCancel={handleEditCancel}
                            onEditSave={handleEditSave}
                            onDelete={handleDelete}
                            onLike={handleLike}
                            setEditDraft={setEditDraft}
                        />
                    ))}
                </ul>
            )}

            {/* 더보기 */}
            {hasMore && (
                <div className="text-center mb-6">
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm px-5 py-2 border border-neutral-300 rounded-lg text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${total - comments.length}개 남음)`}
                    </button>
                </div>
            )}

            {/* 작성 폼 */}
            <div className="pt-4 border-t border-gray-100">
                {isClosed ? (
                    <p className="text-sm text-gray-400 text-center py-3">
                        종료된 토론입니다. 댓글을 작성할 수 없습니다.
                    </p>
                ) : userId ? (
                    <div className="space-y-2">
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
                        {writeErrorType !== 'rate_limit' && writeError && (
                            <p className="text-sm text-red-500">{writeError}</p>
                        )}
                        {pendingNotice && (
                            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-300 rounded px-3 py-2">
                                {pendingNotice}
                            </p>
                        )}
                        <textarea
                            value={draft}
                            onChange={(e) => {
                                setDraft(e.target.value)
                                if (writeErrorType === 'validation') {
                                    setWriteError(null)
                                    setWriteErrorType(null)
                                }
                            }}
                            placeholder="댓글을 입력하세요..."
                            rows={3}
                            className={[
                                'w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none',
                                writeErrorType === 'validation'
                                    ? 'border-red-400 focus:border-red-400'
                                    : 'border-gray-300 focus:border-neutral-400',
                            ].join(' ')}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">{draft.length} / 1000</span>
                            <button
                                onClick={handleWrite}
                                disabled={!draft.trim() || submittingWrite || rateLimitCountdown > 0}
                                className="text-sm px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                                {submittingWrite ? '등록 중...' : '등록'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-3">
                        <a href="/login" className="text-blue-600 underline">로그인</a>하면 댓글을 작성할 수 있습니다.
                        로그인했는데도 이 문구가 보이면 페이지를 새로고침해 보세요.
                    </p>
                )}
            </div>
        </div>
    )
}

/* ─── 댓글 단일 아이템 컴포넌트 ─── */

interface CommentItemProps {
    comment: CommentWithLike
    userId: string | null
    isBest?: boolean
    editingId: string | null
    editDraft: string
    submittingEdit: boolean
    deletingId: string | null
    likingId: string | null
    onEditStart: (c: Comment) => void
    onEditCancel: () => void
    onEditSave: (id: string) => void
    onDelete: (id: string) => void
    onLike: (id: string, type: 'like' | 'dislike') => void
    setEditDraft: (v: string) => void
}

function CommentItem({
    comment, userId, isBest,
    editingId, editDraft, submittingEdit, deletingId, likingId,
    onEditStart, onEditCancel, onEditSave, onDelete, onLike, setEditDraft,
}: CommentItemProps) {
    const isMine = userId === comment.user_id
    const isEditing = editingId === comment.id
    const isDeleting = deletingId === comment.id
    const isLiking = likingId === comment.id
    const myType = comment.userLikeType ?? null

    return (
        <li className={[
            'py-4',
            isBest ? 'px-3 bg-amber-50 rounded-lg border border-amber-100' : '',
        ].join(' ')}>
            {/* 작성자 + 시간 + 본인 액션 */}
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">
                    {authorLabel(comment)}
                </span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                        {formatRelativeTime(comment.created_at)}
                    </span>
                    {isMine && !isEditing && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEditStart(comment)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                수정
                            </button>
                            <button
                                onClick={() => onDelete(comment.id)}
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
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-neutral-400"
                    />
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={onEditCancel}
                            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => onEditSave(comment.id)}
                            disabled={!editDraft.trim() || submittingEdit}
                            className="text-xs px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
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

            {/* 좋아요/싫어요 */}
            {!isEditing && (
                <div className="flex items-center gap-2 mt-2">
                    <button
                        onClick={() => onLike(comment.id, 'like')}
                        disabled={!userId || isLiking}
                        className={[
                            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                            myType === 'like'
                                ? 'border-blue-400 bg-blue-50 text-blue-600 font-medium'
                                : 'border-gray-200 text-gray-500 hover:border-gray-400',
                            (!userId || isLiking) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        ].join(' ')}
                    >
                        <span>👍</span>
                        <span>좋아요 {comment.like_count}</span>
                    </button>
                    <button
                        onClick={() => onLike(comment.id, 'dislike')}
                        disabled={!userId || isLiking}
                        className={[
                            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                            myType === 'dislike'
                                ? 'border-red-400 bg-red-50 text-red-500 font-medium'
                                : 'border-gray-200 text-gray-500 hover:border-gray-400',
                            (!userId || isLiking) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        ].join(' ')}
                    >
                        <span>👎</span>
                        <span>싫어요 {comment.dislike_count}</span>
                    </button>
                </div>
            )}
        </li>
    )
}
