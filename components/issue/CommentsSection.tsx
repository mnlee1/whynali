/**
 * components/issue/CommentsSection.tsx
 *
 * 이슈 댓글 및 토론 댓글 섹션.
 * - 베스트 댓글(score 상위) 상단 고정
 * - 리스트 정렬: 최신순 / 좋아요순 / 싫어요순
 * - 댓글별 좋아요/싫어요 버튼 (토글, 낙관적 업데이트)
 * - 답글(대댓글) 작성/표시 (1단계)
 * - 댓글·답글 신고 (reports 테이블)
 * - 작성/수정/삭제, 세이프티봇 연동
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDate } from '@/lib/utils/format-date'
import type { Comment } from '@/types'
import SafetyBotSettingModal from '@/components/issue/SafetyBotSettingModal'
import ReportModal from '@/components/issue/ReportModal'

interface CommentsSectionProps {
    issueId?: string
    discussionTopicId?: string
    userId: string | null
    isClosed?: boolean
}

type SortOption = 'latest' | 'likes' | 'dislikes'
type CommentWithLike = Comment & {
    userLikeType?: 'like' | 'dislike' | null
    replyCount?: number
}

const PAGE_SIZE = 5
const RATE_LIMIT_SECONDS = 60

const SORT_LABELS: Record<SortOption, string> = {
    latest: '최신순',
    likes: '좋아요순',
    dislikes: '싫어요순',
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

    /* 댓글 목록 상태 */
    const [bestComments, setBestComments] = useState<CommentWithLike[]>([])
    const [comments, setComments] = useState<CommentWithLike[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [sort, setSort] = useState<SortOption>('latest')
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /* 댓글 작성 상태 */
    const [draft, setDraft] = useState('')
    const [submittingWrite, setSubmittingWrite] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)
    const [writeErrorType, setWriteErrorType] = useState<'rate_limit' | 'validation' | null>(null)
    const [pendingNotice, setPendingNotice] = useState<string | null>(null)
    const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    /* 수정/삭제/좋아요 상태 */
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
    const [showReportModal, setShowReportModal] = useState(false)
    const [reportTargetComment, setReportTargetComment] = useState<{ id: string; body: string; authorNickname: string } | null>(null)

    /* 세이프티봇 상태 */
    const [safetyBotEnabled, setSafetyBotEnabled] = useState(true)
    const [safetyModalOpen, setSafetyModalOpen] = useState(false)

    /* 인증 보완: SSR에서 userId를 못 받은 경우 클라이언트에서 재조회 */
    useEffect(() => {
        if (serverUserId) { setUserId(serverUserId); return }
        fetch('/api/auth/me')
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.id) setUserId(d.id) })
            .catch(() => {})
    }, [serverUserId])

    /* 세이프티봇 설정 초기화 (localStorage) */
    useEffect(() => {
        const stored = localStorage.getItem('safety_bot_enabled')
        setSafetyBotEnabled(stored !== 'false')
    }, [])

    const contextParam = issueId
        ? `issue_id=${issueId}`
        : `discussion_topic_id=${discussionTopicId}`

    /* 베스트 댓글 조회 */
    const loadBest = useCallback(async (includePending: boolean) => {
        try {
            const pending = includePending ? '&includePending=true' : ''
            const res = await fetch(`/api/comments?${contextParam}&best=true${pending}`)
            const json = await res.json()
            if (res.ok) setBestComments(json.data ?? [])
        } catch { /* 베스트 조회 실패는 무시 */ }
    }, [contextParam])

    /* 일반 댓글 목록 조회 */
    const loadComments = useCallback(async (
        currentOffset: number,
        append: boolean,
        currentSort: SortOption,
        includePending: boolean
    ) => {
        try {
            const pending = includePending ? '&includePending=true' : ''
            const res = await fetch(
                `/api/comments?${contextParam}&limit=${PAGE_SIZE}&offset=${currentOffset}&sort=${currentSort}${pending}`
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
        const includePending = !safetyBotEnabled
        loadBest(includePending)
        loadComments(0, false, sort, includePending)
    }, [loadBest, loadComments, sort, safetyBotEnabled])

    const handleSortChange = (newSort: SortOption) => {
        if (newSort === sort) return
        setSort(newSort)
        setOffset(0)
        setLoading(true)
        loadComments(0, false, newSort, !safetyBotEnabled)
    }

    const handleLoadMore = () => {
        const next = offset + PAGE_SIZE
        setOffset(next)
        setLoadingMore(true)
        loadComments(next, true, sort, !safetyBotEnabled)
    }

    const handleSafetyBotConfirm = (enabled: boolean) => {
        setSafetyBotEnabled(enabled)
        setOffset(0)
        setLoading(true)
        loadBest(!enabled)
        loadComments(0, false, sort, !enabled)
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

    const redirectToLogin = () => {
        const currentPath = window.location.pathname
        if (confirm('로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?')) {
            window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
        }
    }

    /* 댓글 작성 */
    const handleWrite = async () => {
        if (!userId) { redirectToLogin(); return }
        if (!draft.trim() || submittingWrite || rateLimitCountdown > 0) return
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
            loadBest(!safetyBotEnabled)
            await loadComments(0, false, sort, !safetyBotEnabled)
        } catch {
            setWriteError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.')
        } finally {
            setSubmittingWrite(false)
        }
    }

    /* 수정 */
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
            setEditingId(null)
            setEditDraft('')
            const updatedBody = editDraft.trim()
            const updater = (prev: CommentWithLike[]) =>
                prev.map((c) => c.id === commentId ? { ...c, body: updatedBody } : c)
            setComments(updater)
            setBestComments(updater)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, updater(rs)])
            ))
        } catch (e) {
            setError(e instanceof Error ? e.message : '수정 실패')
        } finally {
            setSubmittingEdit(false)
        }
    }

    /* 삭제 */
    const handleDelete = async (commentId: string) => {
        if (!window.confirm('댓글을 삭제하시겠습니까?')) return
        setDeletingId(commentId)
        try {
            const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            const isTopLevel = comments.some((c) => c.id === commentId)
            if (isTopLevel) {
                setComments((prev) => prev.filter((c) => c.id !== commentId))
                setBestComments((prev) => prev.filter((c) => c.id !== commentId))
                setTotal((prev) => Math.max(0, prev - 1))
            } else {
                /* 답글 삭제: repliesMap에서 제거 + 부모 replyCount 감소 */
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

    /* 좋아요/싫어요 토글 (낙관적 업데이트, 답글도 포함) */
    const handleLike = async (commentId: string, type: 'like' | 'dislike') => {
        if (!userId) { redirectToLogin(); return }
        if (likingId) return
        setLikingId(commentId)

        const prevComments = [...comments]
        const prevBestComments = [...bestComments]
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
        setBestComments(applyOptimistic)
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
                setBestComments(prevBestComments)
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
            setBestComments(applyServer)
            setRepliesMap((prev) => Object.fromEntries(
                Object.entries(prev).map(([pid, rs]) => [pid, applyServer(rs)])
            ))
        } catch {
            setComments(prevComments)
            setBestComments(prevBestComments)
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
                    issue_id: issueId ?? null,
                    discussion_topic_id: discussionTopicId ?? null,
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

    /* 답글 목록 토글 (미로드 시 API 조회) */
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

    /* 신고 모달 열기 */
    const handleOpenReportModal = (comment: Comment) => {
        setReportTargetComment({
            id: comment.id,
            body: comment.body,
            authorNickname: authorLabel(comment),
        })
        setShowReportModal(true)
    }

    /* 신고: 모달에서 사유 선택 후 제출 (낙관적 업데이트) */
    const handleReport = async (commentId: string, reason: string) => {
        if (reportedIds.has(commentId)) return
        setReportedIds((prev) => new Set([...prev, commentId]))
        try {
            await fetch(`/api/comments/${commentId}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            })
        } catch { /* 신고 실패 시 상태 유지 (UX 단순화) */ }
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
        <>
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
                                    reportedIds={reportedIds}
                                    onEditStart={handleEditStart}
                                    onEditCancel={handleEditCancel}
                                    onEditSave={handleEditSave}
                                    onDelete={handleDelete}
                                    onLike={handleLike}
                                    onOpenReportModal={handleOpenReportModal}
                                    setEditDraft={setEditDraft}
                                />
                            ))}
                        </ul>
                        <hr className="mt-4 border-gray-100" />
                    </div>
                )}

                {/* 작성 폼 */}
                <div className="pb-4 border-b border-gray-100 mb-4">
                    {isClosed ? (
                        <p className="text-sm text-gray-400 text-center py-3">
                            종료된 토론입니다. 댓글을 작성할 수 없습니다.
                        </p>
                    ) : (
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
                                onClick={() => { if (!userId) redirectToLogin() }}
                                placeholder={userId ? '댓글을 입력하세요...' : '댓글을 작성하려면 로그인하세요'}
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
                    )}
                </div>

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

                {/* 세이프티봇 안내 바 */}
                <div className="flex items-center justify-between px-3 py-2 mb-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500">
                        <span className="mr-1">🤖</span>
                        {safetyBotEnabled
                            ? '세이프티봇이 불쾌한 댓글로부터 보호하고 있어요.'
                            : '세이프티봇이 꺼져 있어요. 모든 댓글이 표시됩니다.'}
                    </p>
                    <button
                        onClick={() => setSafetyModalOpen(true)}
                        className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-2 py-0.5 shrink-0 ml-2 transition-colors hover:border-gray-400"
                    >
                        설정
                    </button>
                </div>

                {safetyModalOpen && (
                    <SafetyBotSettingModal
                        onClose={() => setSafetyModalOpen(false)}
                        onConfirm={handleSafetyBotConfirm}
                    />
                )}

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
                                replyToId={replyToId}
                                replyDraft={replyDraft}
                                submittingReply={submittingReply}
                                replyError={replyError}
                                rateLimitCountdown={rateLimitCountdown}
                                replies={repliesMap[comment.id]}
                                repliesExpanded={expandedRepliesIds.has(comment.id)}
                                repliesLoading={loadingRepliesIds.has(comment.id)}
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
                                onOpenReportModal={handleOpenReportModal}
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
            </div>

            {/* 신고 모달 */}
            {showReportModal && reportTargetComment && (
                <ReportModal
                    isOpen={showReportModal}
                    onClose={() => setShowReportModal(false)}
                    comment={reportTargetComment}
                    onReport={handleReport}
                />
            )}
        </>
    )
}

/* ─── 댓글 단일 아이템 컴포넌트 ─── */

interface CommentItemProps {
    comment: CommentWithLike
    userId: string | null
    isBest?: boolean
    isReply?: boolean
    editingId: string | null
    editDraft: string
    submittingEdit: boolean
    deletingId: string | null
    likingId: string | null
    /* 답글 관련 (최상위 댓글에서만 사용) */
    replyToId?: string | null
    replyDraft?: string
    submittingReply?: boolean
    replyError?: string | null
    rateLimitCountdown?: number
    replies?: CommentWithLike[]
    repliesExpanded?: boolean
    repliesLoading?: boolean
    /* 신고 */
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
    onOpenReportModal: (comment: Comment) => void
    setEditDraft: (v: string) => void
}

function CommentItem({
    comment, userId, isBest, isReply,
    editingId, editDraft, submittingEdit, deletingId, likingId,
    replyToId, replyDraft, submittingReply, replyError, rateLimitCountdown,
    replies, repliesExpanded, repliesLoading,
    reportedIds,
    onEditStart, onEditCancel, onEditSave, onDelete, onLike,
    onReplyToggle, onReplyDraftChange, onReplySubmit, onToggleReplies,
    onOpenReportModal, setEditDraft,
}: CommentItemProps) {

    const isMine = userId === comment.user_id
    const isEditing = editingId === comment.id
    const isDeleting = deletingId === comment.id
    const isLiking = likingId === comment.id
    const myType = comment.userLikeType ?? null
    const replyCount = comment.replyCount ?? 0
    const isReplyFormOpen = replyToId === comment.id
    const hasReplies = replyCount > 0 || ((replies?.length ?? 0) > 0)
    const isReported = reportedIds.has(comment.id)

    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [menuOpen])

    return (
        <li className={[
            'py-4',
            isBest ? 'px-3 bg-amber-50 rounded-lg border border-amber-100' : '',
            isReply ? 'py-3' : '',
        ].join(' ')}>
            {/* 작성자 + 시간 + 본인 액션 + ... 메뉴 */}
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{authorLabel(comment)}</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
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
                    {/* 더보기 메뉴 (타인 댓글·답글 + 로그인 시) */}
                    {!isMine && userId && (
                        <div className="relative" ref={menuRef}>
                            {isReported ? (
                                <span className="text-xs text-gray-400 px-1">신고완료</span>
                            ) : (
                                <button
                                    onClick={() => setMenuOpen((prev) => !prev)}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-1 leading-none"
                                    aria-label="더보기"
                                >
                                    ⋮
                                </button>
                            )}
                            {menuOpen && (
                                <div className="absolute right-0 top-6 z-10 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                    <button
                                        onClick={() => { setMenuOpen(false); onOpenReportModal(comment) }}
                                        className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        신고하기
                                    </button>
                                </div>
                            )}
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
                <p className={['text-gray-800 leading-relaxed', isReply ? 'text-xs' : 'text-sm'].join(' ')}>
                    {comment.body}
                </p>
            )}

            {/* 답글 달기(좌) + 좋아요/싫어요(우) */}
            {!isEditing && (
                <div className="flex items-center justify-between mt-2">
                    {/* 답글 달기 버튼 (로그인 + 최상위 댓글만) */}
                    <div>
                        {!isReply && userId && onReplyToggle && (
                            <button
                                onClick={() => onReplyToggle(comment.id)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                            >
                                {isReplyFormOpen ? '취소' : '답글 달기'}
                            </button>
                        )}
                    </div>
                    {/* 좋아요/싫어요 우측 정렬 */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onLike(comment.id, 'like')}
                            disabled={isLiking}
                            className={[
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                                myType === 'like'
                                    ? 'border-blue-400 bg-blue-50 text-blue-600 font-medium'
                                    : 'border-gray-200 text-gray-500 hover:border-gray-400',
                                isLiking ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            ].join(' ')}
                        >
                            <span>👍</span>
                            <span>좋아요 {comment.like_count}</span>
                        </button>
                        <button
                            onClick={() => onLike(comment.id, 'dislike')}
                            disabled={isLiking}
                            className={[
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors',
                                myType === 'dislike'
                                    ? 'border-red-400 bg-red-50 text-red-500 font-medium'
                                    : 'border-gray-200 text-gray-500 hover:border-gray-400',
                                isLiking ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                            ].join(' ')}
                        >
                            <span>👎</span>
                            <span>싫어요 {comment.dislike_count}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 인라인 답글 작성 폼 */}
            {!isReply && isReplyFormOpen && onReplyDraftChange && onReplySubmit && (
                <div className="mt-3 pl-4 border-l-2 border-gray-100">
                    {replyError && <p className="text-xs text-red-500 mb-1">{replyError}</p>}
                    <textarea
                        value={replyDraft ?? ''}
                        onChange={(e) => onReplyDraftChange(e.target.value)}
                        placeholder="답글을 입력하세요..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-neutral-400"
                    />
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">{(replyDraft ?? '').length} / 1000</span>
                        <button
                            onClick={() => onReplySubmit(comment.id)}
                            disabled={!replyDraft?.trim() || submittingReply || (rateLimitCountdown ?? 0) > 0}
                            className="text-xs px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
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
                    className="mt-2 text-xs text-blue-500 hover:text-blue-700"
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
                <ul className="mt-2 pl-8 border-l border-gray-100 divide-y divide-gray-50">
                    {replies.map((reply) => (
                        <CommentItem
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
                            onOpenReportModal={onOpenReportModal}
                            setEditDraft={setEditDraft}
                        />
                    ))}
                </ul>
            )}
        </li>
    )
}
