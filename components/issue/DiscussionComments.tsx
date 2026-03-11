'use client'

/**
 * components/issue/DiscussionComments.tsx
 *
 * 토론 주제 전용 댓글 컴포넌트.
 * - 질문 스타터 칩 (클릭하면 textarea에 삽입)
 * - 토론 톤 안내 placeholder
 * - 공감/비공감 (낙관적 업데이트)
 * - 답글(대댓글) 작성/조회/펼치기
 * - 신고 드롭다운 (본인 의견 제외)
 * - 세이프티봇 pending 처리
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Comment } from '@/types'

interface DiscussionCommentsProps {
    discussionTopicId: string
    userId: string | null
    isClosed?: boolean
}

type CommentWithLike = Comment & {
    userLikeType?: 'like' | 'dislike' | null
    replyCount?: number
}

const PAGE_SIZE = 20
const RATE_LIMIT_SECONDS = 60
const REPORT_REASONS = ['스팸', '욕설/혐오', '허위정보', '기타'] as const

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
    const [comments, setComments] = useState<CommentWithLike[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
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

    /* 답글 상태 */
    const [replyToId, setReplyToId] = useState<string | null>(null)
    const [replyDraft, setReplyDraft] = useState('')
    const [submittingReply, setSubmittingReply] = useState(false)
    const [replyError, setReplyError] = useState<string | null>(null)
    const [repliesMap, setRepliesMap] = useState<Record<string, CommentWithLike[]>>({})
    const [expandedRepliesIds, setExpandedRepliesIds] = useState<Set<string>>(new Set())
    const [loadingRepliesIds, setLoadingRepliesIds] = useState<Set<string>>(new Set())

    /* 신고 상태 */
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

    const contextParam = `discussion_topic_id=${discussionTopicId}`

    const loadComments = useCallback(async (currentOffset: number, append: boolean) => {
        try {
            const res = await fetch(
                `/api/comments?${contextParam}&limit=${PAGE_SIZE}&offset=${currentOffset}&sort=latest`
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
        loadComments(0, false)
    }, [loadComments])

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadComments(next, true)
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
            await loadComments(0, false)
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
            const updatedBody = editDraft.trim()
            const updater = (prev: CommentWithLike[]) =>
                prev.map((c) => c.id === commentId ? { ...c, body: updatedBody } : c)
            setComments(updater)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, updater(rs)])
            ))
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

            const isTopLevel = comments.some((c) => c.id === commentId)
            if (isTopLevel) {
                setComments((prev) => prev.filter((c) => c.id !== commentId))
                setTotal((prev) => Math.max(0, prev - 1))
            } else {
                let parentId: string | null = null
                for (const [pid, replies] of Object.entries(repliesMap)) {
                    if (replies.some((r) => r.id === commentId)) { parentId = pid; break }
                }
                if (parentId) {
                    const pid = parentId
                    setRepliesMap((prev) => ({ ...prev, [pid]: prev[pid].filter((r) => r.id !== commentId) }))
                    setComments((prev) => prev.map((c) =>
                        c.id === pid ? { ...c, replyCount: Math.max(0, (c.replyCount ?? 0) - 1) } : c
                    ))
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    const handleLike = async (commentId: string, type: 'like' | 'dislike') => {
        if (!userId || likingId) return
        setLikingId(commentId)

        const prevComments = [...comments]
        const prevRepliesMap = { ...repliesMap }

        const applyOptimistic = (list: CommentWithLike[]) =>
            list.map((c) => {
                if (c.id !== commentId) return c
                const cur = c.userLikeType
                let likes = c.like_count, dislikes = c.dislike_count
                let newType: typeof cur = type
                if (cur === type) {
                    newType = null
                    if (type === 'like') likes = Math.max(0, likes - 1)
                    else dislikes = Math.max(0, dislikes - 1)
                } else {
                    if (cur === 'like') { likes = Math.max(0, likes - 1); dislikes++ }
                    else if (cur === 'dislike') { dislikes = Math.max(0, dislikes - 1); likes++ }
                    else if (type === 'like') likes++
                    else dislikes++
                }
                return { ...c, like_count: likes, dislike_count: dislikes, userLikeType: newType }
            })

        setComments(applyOptimistic)
        setRepliesMap((prev) => Object.fromEntries(
            Object.entries(prev).map(([pid, rs]) => [pid, applyOptimistic(rs)])
        ))
        setTimeout(() => setLikingId(null), 300)

        try {
            const res = await fetch(`/api/comments/${commentId}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            })
            const json = await res.json()
            if (!res.ok) {
                setComments(prevComments)
                setRepliesMap(prevRepliesMap)
                return
            }
            const applyServer = (list: CommentWithLike[]) =>
                list.map((c) =>
                    c.id === commentId
                        ? { ...c, like_count: json.like_count, dislike_count: json.dislike_count, userLikeType: json.userType }
                        : c
                )
            setComments(applyServer)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, applyServer(rs)])
            ))
        } catch {
            setComments(prevComments)
            setRepliesMap(prevRepliesMap)
        }
    }

    /* 답글 폼 토글 */
    const handleReplyToggle = (commentId: string) => {
        if (replyToId === commentId) {
            setReplyToId(null)
            setReplyDraft('')
            setReplyError(null)
        } else {
            setReplyToId(commentId)
            setReplyDraft('')
            setReplyError(null)
        }
    }

    /* 답글 제출 */
    const handleReplySubmit = async (parentId: string) => {
        if (!replyDraft.trim() || submittingReply) return
        setSubmittingReply(true)
        setReplyError(null)
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_id: null,
                    discussion_topic_id: discussionTopicId,
                    parent_id: parentId,
                    content: replyDraft.trim(),
                }),
            })
            const json = await res.json()
            if (res.status === 429) {
                setReplyError(json.error ?? '잠시 후 다시 시도해 주세요.')
                startRateLimitCountdown()
                return
            }
            if (!res.ok) { setReplyError(json.error ?? '오류가 발생했습니다.'); return }
            setReplyDraft('')
            setReplyToId(null)
            if (!json.pending && json.data) {
                const newReply: CommentWithLike = { ...json.data, userLikeType: null, replyCount: 0 }
                setRepliesMap((prev) => ({ ...prev, [parentId]: [...(prev[parentId] ?? []), newReply] }))
                setExpandedRepliesIds((prev) => new Set([...prev, parentId]))
                setComments((prev) => prev.map((c) =>
                    c.id === parentId ? { ...c, replyCount: (c.replyCount ?? 0) + 1 } : c
                ))
            }
        } finally {
            setSubmittingReply(false)
        }
    }

    /* 답글 목록 토글 */
    const handleToggleReplies = async (commentId: string) => {
        if (expandedRepliesIds.has(commentId)) {
            setExpandedRepliesIds((prev) => new Set([...prev].filter((id) => id !== commentId)))
            return
        }
        if (!repliesMap[commentId]) {
            setLoadingRepliesIds((prev) => new Set([...prev, commentId]))
            try {
                const res = await fetch(`/api/comments?${contextParam}&parent_id=${commentId}&limit=50&offset=0`)
                const json = await res.json()
                if (res.ok) setRepliesMap((prev) => ({ ...prev, [commentId]: json.data ?? [] }))
            } finally {
                setLoadingRepliesIds((prev) => new Set([...prev].filter((id) => id !== commentId)))
            }
        }
        setExpandedRepliesIds((prev) => new Set([...prev, commentId]))
    }

    /* 신고 */
    const handleReport = async (commentId: string, reason: string) => {
        if (reportedIds.has(commentId)) return
        setReportedIds((prev) => new Set([...prev, commentId]))
        try {
            await fetch(`/api/comments/${commentId}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            })
        } catch { /* 신고 실패 시 상태 유지 */ }
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

            {/* 총 개수 */}
            <div className="mb-3">
                <p className="text-sm text-gray-500">의견 {total.toLocaleString()}개</p>
            </div>

            {/* 의견 목록 */}
            {comments.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">첫 번째 의견을 남겨보세요.</p>
            ) : (
                <ul className="divide-y divide-purple-50 mb-4">
                    {comments.map((c) => (
                        <DiscussionCommentItem
                            key={c.id}
                            comment={c}
                            userId={userId}
                            editingId={editingId}
                            editDraft={editDraft}
                            submittingEdit={submittingEdit}
                            deletingId={deletingId}
                            likingId={likingId}
                            replyToId={replyToId}
                            replyDraft={replyDraft}
                            submittingReply={submittingReply}
                            replyError={replyError}
                            rateLimitCountdown={rateLimitCountdown}
                            replies={repliesMap[c.id]}
                            repliesExpanded={expandedRepliesIds.has(c.id)}
                            repliesLoading={loadingRepliesIds.has(c.id)}
                            reportedIds={reportedIds}
                            onEditStart={handleEditStart}
                            onEditCancel={handleEditCancel}
                            onEditSave={handleEditSave}
                            onDelete={handleDelete}
                            onLike={handleLike}
                            onReplyToggle={handleReplyToggle}
                            onReplyDraftChange={setReplyDraft}
                            onReplySubmit={handleReplySubmit}
                            onToggleReplies={handleToggleReplies}
                            onReport={handleReport}
                            setEditDraft={setEditDraft}
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
                        <a
                            href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
                            className="text-purple-600 underline"
                        >
                            로그인
                        </a>
                        하면 의견을 남길 수 있습니다.
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
    isReply?: boolean
    editingId: string | null
    editDraft: string
    submittingEdit: boolean
    deletingId: string | null
    likingId: string | null
    replyToId?: string | null
    replyDraft?: string
    submittingReply?: boolean
    replyError?: string | null
    rateLimitCountdown?: number
    replies?: CommentWithLike[]
    repliesExpanded?: boolean
    repliesLoading?: boolean
    reportedIds: Set<string>
    onEditStart: (c: Comment) => void
    onEditCancel: () => void
    onEditSave: (id: string) => void
    onDelete: (id: string) => void
    onLike: (id: string, type: 'like' | 'dislike') => void
    onReplyToggle?: (id: string) => void
    onReplyDraftChange?: (v: string) => void
    onReplySubmit?: (parentId: string) => void
    onToggleReplies?: (id: string) => void
    onReport: (id: string, reason: string) => void
    setEditDraft: (v: string) => void
}

function DiscussionCommentItem({
    comment, userId, isReply,
    editingId, editDraft, submittingEdit, deletingId, likingId,
    replyToId, replyDraft, submittingReply, replyError, rateLimitCountdown,
    replies, repliesExpanded, repliesLoading,
    reportedIds,
    onEditStart, onEditCancel, onEditSave, onDelete, onLike,
    onReplyToggle, onReplyDraftChange, onReplySubmit, onToggleReplies,
    onReport, setEditDraft,
}: DiscussionCommentItemProps) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [showReasons, setShowReasons] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    const closeMenu = () => { setMenuOpen(false); setShowReasons(false) }

    useEffect(() => {
        if (!menuOpen) { setShowReasons(false); return }
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [menuOpen])

    const isMine = userId === comment.user_id
    const isEditing = editingId === comment.id
    const isDeleting = deletingId === comment.id
    const isLiking = likingId === comment.id
    const myType = comment.userLikeType ?? null
    const replyCount = comment.replyCount ?? 0
    const isReplyFormOpen = replyToId === comment.id
    const hasReplies = replyCount > 0 || ((replies?.length ?? 0) > 0)
    const isReported = reportedIds.has(comment.id)

    return (
        <li className={['py-4', isReply ? 'py-3' : ''].join(' ')}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{authorLabel(comment)}</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formatRelativeTime(comment.created_at)}</span>
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
                    {/* 신고 ⋮ 드롭다운 (타인 의견 + 로그인 시) */}
                    {!isMine && userId && (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen((v) => !v)}
                                className="text-xs text-gray-400 hover:text-gray-600 px-1 leading-none"
                                aria-label="더보기"
                            >
                                ⋮
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded-lg shadow-md py-1 min-w-[120px]">
                                    {isReported ? (
                                        <span className="block px-3 py-1.5 text-xs text-gray-400">신고완료</span>
                                    ) : !showReasons ? (
                                        <button
                                            onClick={() => setShowReasons(true)}
                                            className="block w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                                        >
                                            신고
                                        </button>
                                    ) : (
                                        <>
                                            <span className="block px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
                                                신고 사유 선택
                                            </span>
                                            {REPORT_REASONS.map((reason) => (
                                                <button
                                                    key={reason}
                                                    onClick={() => { onReport(comment.id, reason); closeMenu() }}
                                                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                                                >
                                                    {reason}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
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
                        <button
                            onClick={onEditCancel}
                            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => onEditSave(comment.id)}
                            disabled={!editDraft.trim() || submittingEdit}
                            className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                        >
                            {submittingEdit ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            ) : (
                <p className={[
                    'text-gray-800 leading-relaxed whitespace-pre-wrap',
                    isReply ? 'text-xs' : 'text-sm',
                ].join(' ')}>
                    {comment.body}
                </p>
            )}

            {/* 답글 달기(좌) + 공감/비공감(우) */}
            {!isEditing && (
                <div className="flex items-center justify-between mt-2">
                    <div>
                        {!isReply && userId && onReplyToggle && (
                            <button
                                onClick={() => onReplyToggle(comment.id)}
                                className="text-xs text-gray-400 hover:text-purple-500"
                            >
                                {isReplyFormOpen ? '취소' : '답글 달기'}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onLike(comment.id, 'like')}
                            disabled={!userId || isLiking}
                            className={[
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                                myType === 'like'
                                    ? 'border-purple-400 bg-purple-50 text-purple-600 font-medium'
                                    : 'border-gray-200 text-gray-500 hover:border-purple-300',
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
                                myType === 'dislike'
                                    ? 'border-red-400 bg-red-50 text-red-500 font-medium'
                                    : 'border-gray-200 text-gray-500 hover:border-gray-400',
                                (!userId || isLiking) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            ].join(' ')}
                        >
                            <span>👎</span>
                            <span>비공감 {comment.dislike_count}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 인라인 답글 작성 폼 */}
            {!isReply && isReplyFormOpen && onReplyDraftChange && onReplySubmit && (
                <div className="mt-3 pl-4 border-l-2 border-purple-100">
                    {replyError && <p className="text-xs text-red-500 mb-1">{replyError}</p>}
                    <textarea
                        value={replyDraft ?? ''}
                        onChange={(e) => onReplyDraftChange(e.target.value)}
                        placeholder="답글을 입력하세요..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg resize-none focus:outline-none focus:border-purple-400"
                    />
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">{(replyDraft ?? '').length} / 1000</span>
                        <button
                            onClick={() => onReplySubmit(comment.id)}
                            disabled={!replyDraft?.trim() || submittingReply || (rateLimitCountdown ?? 0) > 0}
                            className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submittingReply ? '등록 중...' : '등록'}
                        </button>
                    </div>
                </div>
            )}

            {/* 답글 펼치기/접기 버튼 */}
            {!isReply && hasReplies && onToggleReplies && (
                <button
                    onClick={() => onToggleReplies(comment.id)}
                    className="mt-2 text-xs text-purple-500 hover:text-purple-700"
                >
                    {repliesLoading
                        ? '불러오는 중...'
                        : repliesExpanded
                            ? '답글 접기'
                            : `답글 ${replyCount}개 보기`}
                </button>
            )}

            {/* 답글 목록 */}
            {!isReply && repliesExpanded && replies && replies.length > 0 && (
                <ul className="mt-2 pl-8 border-l border-purple-100 divide-y divide-purple-50">
                    {replies.map((reply) => (
                        <DiscussionCommentItem
                            key={reply.id}
                            comment={reply}
                            userId={userId}
                            isReply
                            editingId={editingId}
                            editDraft={editDraft}
                            submittingEdit={submittingEdit}
                            deletingId={deletingId}
                            likingId={likingId}
                            reportedIds={reportedIds}
                            onEditStart={onEditStart}
                            onEditCancel={onEditCancel}
                            onEditSave={onEditSave}
                            onDelete={onDelete}
                            onLike={onLike}
                            onReport={onReport}
                            setEditDraft={setEditDraft}
                        />
                    ))}
                </ul>
            )}
        </li>
    )
}
