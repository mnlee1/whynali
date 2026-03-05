'use client'

/**
 * components/issue/DiscussionComments.tsx
 *
 * 토론 주제 전용 댓글 컴포넌트.
 * CommentsSection과 동일한 구조이지만 철학적 관점 유도 UI 추가:
 * - 질문 스타터 칩 (클릭하면 textarea에 삽입)
 * - 토론 톤 안내 placeholder
 * - 베스트 댓글 상단, 정렬 옵션, 좋아요/싫어요 동일 적용
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Comment } from '@/types'

interface DiscussionCommentsProps {
    discussionTopicId: string
    userId: string | null
    isClosed?: boolean
}

type SortOption = 'latest' | 'likes' | 'dislikes'
type CommentWithLike = Comment & { userLikeType?: 'like' | 'dislike' | null }

const PAGE_SIZE = 20
const RATE_LIMIT_SECONDS = 60

const SORT_LABELS: Record<SortOption, string> = {
    latest: '최신순',
    likes: '공감순',
    dislikes: '비공감순',
}

/* 클릭하면 textarea 앞부분에 삽입되는 질문 스타터 칩 */
const STARTERS = [
    '제 생각에는...',
    '다른 시각으로 보면...',
    '만약 제가 당사자라면...',
    '이 상황의 근본 원인은...',
    '사회적으로 봤을 때...',
]

function formatRelativeTime(dateString: string): string {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}일 전`
    return new Date(dateString).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function authorLabel(comment: Comment): string {
    if (comment.display_name?.trim()) return comment.display_name.trim()
    return `사용자 …${comment.user_id.slice(-4)}`
}

export default function DiscussionComments({
    discussionTopicId,
    userId: serverUserId,
    isClosed = false,
}: DiscussionCommentsProps) {
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

    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

    const contextParam = `discussion_topic_id=${discussionTopicId}`

    const loadBest = useCallback(async () => {
        try {
            const res = await fetch(`/api/comments?${contextParam}&best=true`)
            const json = await res.json()
            if (res.ok) setBestComments(json.data ?? [])
        } catch { /* 무시 */ }
    }, [contextParam])

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

    useEffect(() => {
        setLoading(true)
        loadBest()
        loadComments(0, false, sort)
    }, [loadBest, loadComments, sort])

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

    const startRateLimitCountdown = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setRateLimitCountdown(RATE_LIMIT_SECONDS)
        countdownRef.current = setInterval(() => {
            setRateLimitCountdown((prev) => {
                if (prev <= 1) {
                    if (countdownRef.current) clearInterval(countdownRef.current)
                    setWriteError(null); setWriteErrorType(null); return 0
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
                    issue_id: null,
                    discussion_topic_id: discussionTopicId,
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

    const handleEditStart = (comment: Comment) => { setEditingId(comment.id); setEditDraft(comment.body) }
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
            setEditingId(null); setEditDraft('')
            setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body: editDraft.trim() } : c))
        } catch (e) {
            setError(e instanceof Error ? e.message : '수정 실패')
        } finally {
            setSubmittingEdit(false)
        }
    }

    const handleDelete = async (commentId: string) => {
        if (!window.confirm('의견을 삭제하시겠습니까?')) return
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

    const handleLike = async (commentId: string, type: 'like' | 'dislike') => {
        if (!userId || likingId) return
        setLikingId(commentId)

        // 현재 상태 저장 (롤백용)
        const currentComments = [...comments]
        const currentBestComments = [...bestComments]

        // 낙관적 업데이트: 즉시 UI 반영
        const optimisticUpdater = (prev: CommentWithLike[]) =>
            prev.map((c) => {
                if (c.id !== commentId) return c
                
                const currentType = c.userLikeType
                let newLikeCount = c.like_count
                let newDislikeCount = c.dislike_count
                let newUserType: 'like' | 'dislike' | null = type

                // 같은 타입 클릭 시 토글 (취소)
                if (currentType === type) {
                    newUserType = null
                    if (type === 'like') {
                        newLikeCount = Math.max(0, newLikeCount - 1)
                    } else {
                        newDislikeCount = Math.max(0, newDislikeCount - 1)
                    }
                } else {
                    // 다른 타입으로 변경
                    if (currentType === 'like') {
                        newLikeCount = Math.max(0, newLikeCount - 1)
                        newDislikeCount = newDislikeCount + 1
                    } else if (currentType === 'dislike') {
                        newDislikeCount = Math.max(0, newDislikeCount - 1)
                        newLikeCount = newLikeCount + 1
                    } else {
                        // 처음 클릭
                        if (type === 'like') {
                            newLikeCount = newLikeCount + 1
                        } else {
                            newDislikeCount = newDislikeCount + 1
                        }
                    }
                }

                return {
                    ...c,
                    like_count: newLikeCount,
                    dislike_count: newDislikeCount,
                    userLikeType: newUserType
                }
            })

        setComments(optimisticUpdater)
        setBestComments(optimisticUpdater)

        // 낙관적 업데이트 후 즉시 버튼 활성화 (중복 클릭 방지를 위해 짧은 딜레이)
        setTimeout(() => setLikingId(null), 300)

        try {
            const res = await fetch(`/api/comments/${commentId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            })
            const json = await res.json()
            
            if (!res.ok) {
                // 실패 시 롤백
                setComments(currentComments)
                setBestComments(currentBestComments)
                return
            }

            // 서버 응답으로 최종 확정
            const serverUpdater = (prev: CommentWithLike[]) =>
                prev.map((c) =>
                    c.id === commentId
                        ? { ...c, like_count: json.like_count, dislike_count: json.dislike_count, userLikeType: json.userType }
                        : c
                )
            setComments(serverUpdater)
            setBestComments(serverUpdater)
        } catch {
            // 네트워크 오류 시 롤백
            setComments(currentComments)
            setBestComments(currentBestComments)
        }
    }

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                        <div className="h-3 w-24 bg-purple-100 rounded animate-pulse" />
                        <div className="h-4 w-4/5 bg-purple-50 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {/* 베스트 의견 */}
            {bestComments.length > 0 && (
                <div className="mb-5">
                    <p className="text-xs font-semibold text-purple-500 mb-2 uppercase tracking-wide">
                        주목받는 의견
                    </p>
                    <ul className="space-y-2">
                        {bestComments.map((c) => (
                            <DiscussionCommentItem
                                key={`best-${c.id}`}
                                comment={c} userId={userId} isBest
                                editingId={editingId} editDraft={editDraft}
                                submittingEdit={submittingEdit} deletingId={deletingId} likingId={likingId}
                                onEditStart={handleEditStart} onEditCancel={handleEditCancel}
                                onEditSave={handleEditSave} onDelete={handleDelete}
                                onLike={handleLike} setEditDraft={setEditDraft}
                            />
                        ))}
                    </ul>
                    <hr className="mt-4 border-purple-100" />
                </div>
            )}

            {/* 정렬 + 총 개수 */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">의견 {total.toLocaleString()}개</p>
                <div className="flex gap-1">
                    {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                        <button
                            key={s}
                            onClick={() => handleSortChange(s)}
                            className={[
                                'text-xs px-2.5 py-1 rounded border transition-colors',
                                sort === s
                                    ? 'border-purple-600 bg-purple-600 text-white'
                                    : 'border-gray-200 text-gray-500 hover:border-purple-300',
                            ].join(' ')}
                        >
                            {SORT_LABELS[s]}
                        </button>
                    ))}
                </div>
            </div>

            {/* 의견 목록 */}
            {comments.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">첫 번째 의견을 남겨보세요.</p>
            ) : (
                <ul className="divide-y divide-purple-50 mb-4">
                    {comments.map((c) => (
                        <DiscussionCommentItem
                            key={c.id}
                            comment={c} userId={userId}
                            editingId={editingId} editDraft={editDraft}
                            submittingEdit={submittingEdit} deletingId={deletingId} likingId={likingId}
                            onEditStart={handleEditStart} onEditCancel={handleEditCancel}
                            onEditSave={handleEditSave} onDelete={handleDelete}
                            onLike={handleLike} setEditDraft={setEditDraft}
                        />
                    ))}
                </ul>
            )}

            {comments.length < total && (
                <div className="text-center mb-5">
                    <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm px-5 py-2 border border-purple-200 rounded text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                    >
                        {loadingMore ? '불러오는 중...' : `더보기 (${total - comments.length}개)`}
                    </button>
                </div>
            )}

            {/* 작성 폼 */}
            <div className="pt-4 border-t border-purple-100">
                {isClosed ? (
                    <p className="text-sm text-gray-400 text-center py-3">
                        종료된 토론입니다. 의견을 작성할 수 없습니다.
                    </p>
                ) : userId ? (
                    <div className="space-y-2">
                        {/* 질문 스타터 칩 */}
                        <div className="flex flex-wrap gap-1.5 mb-1">
                            {STARTERS.map((starter) => (
                                <button
                                    key={starter}
                                    type="button"
                                    onClick={() => setDraft((prev) => (prev ? prev + ' ' + starter : starter))}
                                    className="text-xs px-2.5 py-1 rounded-full border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
                                >
                                    {starter}
                                </button>
                            ))}
                        </div>

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
                                if (writeErrorType === 'validation') { setWriteError(null); setWriteErrorType(null) }
                            }}
                            placeholder="단순 찬반보다는, 이 주제에 대한 나만의 관점이나 경험을 자유롭게 적어주세요."
                            rows={4}
                            className={[
                                'w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none',
                                writeErrorType === 'validation'
                                    ? 'border-red-400 focus:border-red-500'
                                    : 'border-purple-200 focus:border-purple-400',
                            ].join(' ')}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">{draft.length} / 1000</span>
                            <button
                                onClick={handleWrite}
                                disabled={!draft.trim() || submittingWrite || rateLimitCountdown > 0}
                                className="text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submittingWrite ? '등록 중...' : '의견 남기기'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-3">
                        <a href="/login" className="text-purple-600 underline">로그인</a>하면 의견을 남길 수 있습니다.
                    </p>
                )}
            </div>
        </div>
    )
}

/* ─── 토론 댓글 아이템 ─── */

interface DiscussionCommentItemProps {
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

function DiscussionCommentItem({
    comment, userId, isBest,
    editingId, editDraft, submittingEdit, deletingId, likingId,
    onEditStart, onEditCancel, onEditSave, onDelete, onLike, setEditDraft,
}: DiscussionCommentItemProps) {
    const isMine = userId === comment.user_id
    const isEditing = editingId === comment.id
    const isDeleting = deletingId === comment.id
    const isLiking = likingId === comment.id
    const myType = comment.userLikeType ?? null

    return (
        <li className={[
            'py-4',
            isBest ? 'px-3 bg-purple-50 rounded-lg border border-purple-100' : '',
        ].join(' ')}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{authorLabel(comment)}</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formatRelativeTime(comment.created_at)}</span>
                    {isMine && !isEditing && (
                        <div className="flex gap-2">
                            <button onClick={() => onEditStart(comment)} className="text-xs text-gray-500 hover:text-gray-700">수정</button>
                            <button onClick={() => onDelete(comment.id)} disabled={isDeleting}
                                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                                {isDeleting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {isEditing ? (
                <div className="mt-2 space-y-2">
                    <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded resize-none focus:outline-none focus:border-purple-400"
                    />
                    <div className="flex gap-2 justify-end">
                        <button onClick={onEditCancel}
                            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                            취소
                        </button>
                        <button onClick={() => onEditSave(comment.id)} disabled={!editDraft.trim() || submittingEdit}
                            className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
                            {submittingEdit ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
            )}

            {!isEditing && (
                <div className="flex items-center gap-2 mt-2">
                    <button
                        onClick={() => onLike(comment.id, 'like')}
                        disabled={!userId || isLiking}
                        className={[
                            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                            myType === 'like' ? 'border-purple-400 bg-purple-50 text-purple-600 font-medium' : 'border-gray-200 text-gray-500 hover:border-purple-300',
                            (!userId || isLiking) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        ].join(' ')}
                    >
                        <span>👍</span>
                        <span>공감 {comment.like_count}</span>
                    </button>
                    <button
                        onClick={() => onLike(comment.id, 'dislike')}
                        disabled={!userId || isLiking}
                        className={[
                            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                            myType === 'dislike' ? 'border-red-400 bg-red-50 text-red-500 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-400',
                            (!userId || isLiking) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        ].join(' ')}
                    >
                        <span>👎</span>
                        <span>비공감 {comment.dislike_count}</span>
                    </button>
                </div>
            )}
        </li>
    )
}
